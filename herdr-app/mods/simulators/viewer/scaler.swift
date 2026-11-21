import Accelerate
import CoreGraphics
import Foundation
import ImageIO
import zlib

let requestHeaderLength = 16
let maxJPEGLength = 64 * 1024 * 1024
let maxSide = 8192
let compressionLevel: Int32 = 1
let minPartLength = 256 * 1024
let zlibHeader: [UInt8] = [0x78, 0x01]

func readExactly(_ count: Int) -> [UInt8]? {
  var bytes = [UInt8](repeating: 0, count: count)
  var filled = 0
  while filled < count {
    let got = bytes.withUnsafeMutableBytes { read(STDIN_FILENO, $0.baseAddress! + filled, count - filled) }
    if got == 0 { return nil }
    if got < 0 {
      if errno == EINTR { continue }
      return nil
    }
    filled += got
  }
  return bytes
}

func writeAll(_ bytes: UnsafeRawBufferPointer) -> Bool {
  var sent = 0
  while sent < bytes.count {
    let put = write(STDOUT_FILENO, bytes.baseAddress! + sent, bytes.count - sent)
    if put < 0 {
      if errno == EINTR { continue }
      return false
    }
    sent += put
  }
  return true
}

func littleEndian<T: FixedWidthInteger>(_ value: T) -> [UInt8] {
  withUnsafeBytes(of: value.littleEndian) { Array($0) }
}

func decode(_ jpeg: [UInt8], longestSide: Int) -> CGImage? {
  guard let source = CGImageSourceCreateWithData(Data(jpeg) as CFData, nil) else { return nil }
  let options: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceThumbnailMaxPixelSize: longestSide,
    kCGImageSourceShouldCacheImmediately: true,
  ]
  return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
}

struct Request {
  let canvas: (width: Int, height: Int)
  let picture: (width: Int, height: Int)
  let quarterTurns: Int
  let color: (red: UInt8, green: UInt8, blue: UInt8)
}

func render(_ image: CGImage, _ request: Request) -> [UInt8]? {
  let (width, height) = request.canvas
  guard let context = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else { return nil }
  context.setFillColor(red: CGFloat(request.color.red) / 255, green: CGFloat(request.color.green) / 255, blue: CGFloat(request.color.blue) / 255, alpha: 1)
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))

  // Why rounded down: the viewer maps the pointer assuming the picture's corner sits exactly there.
  let left = (width - request.picture.width) / 2
  let top = (height - request.picture.height) / 2
  let centre = CGPoint(x: CGFloat(left) + CGFloat(request.picture.width) / 2, y: CGFloat(height - top) - CGFloat(request.picture.height) / 2)
  let sideways = request.quarterTurns % 2 == 1
  let drawn = CGSize(width: sideways ? request.picture.height : request.picture.width, height: sideways ? request.picture.width : request.picture.height)
  context.interpolationQuality = .high
  context.translateBy(x: centre.x, y: centre.y)
  context.rotate(by: -CGFloat(request.quarterTurns) * .pi / 2)
  context.draw(image, in: CGRect(x: -drawn.width / 2, y: -drawn.height / 2, width: drawn.width, height: drawn.height))
  guard let pixels = context.data else { return nil }

  var rgb = [UInt8](repeating: 0, count: width * height * 3)
  var source = vImage_Buffer(data: pixels, height: vImagePixelCount(height), width: vImagePixelCount(width), rowBytes: context.bytesPerRow)
  let converted = rgb.withUnsafeMutableBytes { target -> vImage_Error in
    var destination = vImage_Buffer(data: target.baseAddress, height: vImagePixelCount(height), width: vImagePixelCount(width), rowBytes: width * 3)
    return vImageConvert_RGBA8888toRGB888(&source, &destination, vImage_Flags(kvImageNoFlags))
  }
  return converted == kvImageNoError ? rgb : nil
}

// Why not one deflate call (the parts, all but the last ended on a flush, are deflated on separate cores and simply follow each other): at this size it takes longer than everything else done for a frame put together.
func compress(_ bytes: [UInt8]) -> [UInt8]? {
  let parts = max(1, min(ProcessInfo.processInfo.activeProcessorCount, bytes.count / minPartLength))
  let partLength = bytes.count / parts
  var pieces = [[UInt8]?](repeating: nil, count: parts)
  var sums = [uLong](repeating: 0, count: parts)
  var lengths = [Int](repeating: 0, count: parts)

  bytes.withUnsafeBufferPointer { source in
    pieces.withUnsafeMutableBufferPointer { pieces in
      sums.withUnsafeMutableBufferPointer { sums in
        lengths.withUnsafeMutableBufferPointer { lengths in
          DispatchQueue.concurrentPerform(iterations: parts) { index in
            let start = index * partLength
            let length = index == parts - 1 ? source.count - start : partLength
            let input = UnsafeMutablePointer(mutating: source.baseAddress! + start)
            lengths[index] = length
            sums[index] = adler32(adler32(0, nil, 0), input, uInt(length))

            var stream = z_stream()
            guard deflateInit2_(&stream, compressionLevel, Z_DEFLATED, -MAX_WBITS, 8, Z_DEFAULT_STRATEGY, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK else { return }
            defer { deflateEnd(&stream) }
            var output = [UInt8](repeating: 0, count: Int(deflateBound(&stream, uLong(length))) + 16)
            stream.next_in = input
            stream.avail_in = uInt(length)
            let last = index == parts - 1
            let status = output.withUnsafeMutableBufferPointer { buffer -> Int32 in
              stream.next_out = buffer.baseAddress
              stream.avail_out = uInt(buffer.count)
              return deflate(&stream, last ? Z_FINISH : Z_SYNC_FLUSH)
            }
            guard status == (last ? Z_STREAM_END : Z_OK), stream.avail_in == 0 else { return }
            output.removeSubrange(Int(stream.total_out)...)
            pieces[index] = output
          }
        }
      }
    }
  }

  var packed = zlibHeader
  var checksum = adler32(0, nil, 0)
  for index in 0..<parts {
    guard let piece = pieces[index] else { return nil }
    packed += piece
    checksum = adler32_combine(checksum, sums[index], Int(lengths[index]))
  }
  packed += withUnsafeBytes(of: UInt32(checksum).bigEndian) { Array($0) }
  return packed
}

func respond(_ data: [UInt8], _ request: Request) -> Bool {
  let header = littleEndian(UInt32(data.count)) + littleEndian(UInt16(request.canvas.width)) + littleEndian(UInt16(request.canvas.height))
  return header.withUnsafeBytes(writeAll) && data.withUnsafeBytes(writeAll)
}

signal(SIGPIPE, SIG_IGN)
while let header = readExactly(requestHeaderLength) {
  let word = { (at: Int) in Int(header[at]) | Int(header[at + 1]) << 8 }
  let jpegLength = word(0) | word(2) << 16
  let request = Request(
    canvas: (word(4), word(6)), picture: (word(8), word(10)), quarterTurns: Int(header[12]) % 4,
    color: (header[13], header[14], header[15])
  )
  guard jpegLength > 0, jpegLength <= maxJPEGLength, let jpeg = readExactly(jpegLength) else { break }

  var packed: [UInt8]? = nil
  let sides = [request.canvas.width, request.canvas.height, request.picture.width, request.picture.height]
  if sides.allSatisfy({ $0 > 0 && $0 <= maxSide }) {
    // Why the picture's longest side: the decoder reduces by whole factors on its way to that size, which is what makes a half-size picture cheap.
    if let image = decode(jpeg, longestSide: max(request.picture.width, request.picture.height)) {
      packed = render(image, request).flatMap(compress)
    }
  }
  guard respond(packed ?? [], request) else { break }
}
