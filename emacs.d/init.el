
;; Added by Package.el.  This must come before configurations of
;; installed packages.  Don't delete this line.  If you don't want it,
;; just comment it out by adding a semicolon to the start of the line.
;; You may delete these explanatory comments.
(package-initialize)

(prefer-coding-system 'utf-8)

; server for emacs-client
(require 'server)
(unless (server-running-p)
    (server-start))

(require 'cask)
(cask-initialize)

(require 'powerline)
(powerline-default-theme)

(require 'company)
(global-company-mode)
(setq company-selection-wrap-around t)

(require 'company-emoji)
(add-to-list 'company-backends 'company-emoji)

(require 'git-commit)

(require 'ruby-end)

; 左に行番号表示
(require 'nlinum)
(global-nlinum-mode t)
(setq nlinum-format "%3d ")

(setq x-select-enable-clipboard t)

; use ⌘  as meta key
; SETUP: iTerm2
; - Keys
;   - Remap Modifier Keys: Left command key: ⌥  Left Option
; - Profiles -> Keys
;   - Left option ⌥  key acts as: +Esc
(when (eq system-type 'darwin)
  (setq ns-command-modifier (quote meta)))

; M-x re
(defalias 're 'query-replace-regexp)

(global-set-key "\M-c" 'kill-ring-save)
(global-set-key "\M-y" 'yank)
(global-set-key "\M-s" 'set-mark-command)
(global-set-key "\M-p" 'copy-whole-line)
(global-set-key "\M-d" 'kill-whole-line)
(global-set-key "\M-g" 'goto-line)

(setq auto-mode-alist
  (append '(("\\.gitconfig\\'" . gitconfig-mode)
            ("\\.gitignore\\'" . gitignore-mode)
            ("\\.gitattributes\\'" . gitattributes-mode)
            ("\\.fish\\'" . fish-mode)
            ("\\.rake\\'" . ruby-mode)
            ("Gemfile\\'" . ruby-mode)
            ("Capfile\\'" . ruby-mode))
          auto-mode-alist))

(autoload 'markdown-mode "markdown-mode"
   "Major mode for editing Markdown files" t)
(add-to-list 'auto-mode-alist '("\\.markdown\\'" . markdown-mode))
(add-to-list 'auto-mode-alist '("\\.md\\'" . markdown-mode))

(autoload 'kotlin-mode "kotlin-mode"
   "Mode for editing kotlin files" t)
(add-to-list 'auto-mode-alist '("\\.kt\\'" . kotlin-mode))

(autoload 'gfm-mode "markdown-mode"
   "Major mode for editing GitHub Flavored Markdown files" t)
(add-to-list 'auto-mode-alist '("README\\.md\\'" . gfm-mode))

(add-to-list 'custom-theme-load-path "~/.emacs.d/themes/emacs-material-theme")
(load-theme 'material t)

;; カーソル行を目立たせる
(global-hl-line-mode)

(if (functionp 'tool-bar-mode) (tool-bar-mode 0))
(if (functionp 'menu-bar-mode) (menu-bar-mode 0))

;; バックアップファイルを作らないようにする
(setq make-backup-files nil)
;;; 終了時にオートセーブファイルを消す
(setq delete-auto-save-files t)
;; 自動保存ファイルを生成しない (#README.md#)
(setq auto-save-default nil)

;; for mouse and trackpad
(if (functionp 'xterm-mouse-mode) (xterm-mouse-mode t))
(if (functionp 'mouse-wheel-mode) (mouse-wheel-mode t))
(global-set-key   [mouse-4] '(lambda () (interactive) (scroll-down 1)))
(global-set-key   [mouse-5] '(lambda () (interactive) (scroll-up   1)))

;; avoid saying yes to 'Synbolic link to git-controlled source file; follow link?'
(setq vc-follow-symlinks t)

;;; 行末の空白を表示
(setq-default show-trailing-whitespace t)

;; ruby-mode にて coding: utf-8 を自動挿入させない
(setq ruby-insert-encoding-magic-comment nil)

;;; カーソルの位置が何行目かを表示する
(line-number-mode t)

(custom-set-variables
 ;; custom-set-variables was added by Custom.
 ;; If you edit it by hand, you could mess it up, so be careful.
 ;; Your init file should contain only one such instance.
 ;; If there is more than one, they won't work right.
 '(package-selected-packages (quote (## powerline))))
(custom-set-faces
 ;; custom-set-faces was added by Custom.
 ;; If you edit it by hand, you could mess it up, so be careful.
 ;; Your init file should contain only one such instance.
 ;; If there is more than one, they won't work right.
 )
(defun copy-whole-line (&optional arg)
  "Copy current line."
  (interactive "p")
  (or arg (setq arg 1))
  (if (and (> arg 0) (eobp) (save-excursion (forward-visible-line 0) (eobp)))
      (signal 'end-of-buffer nil))
  (if (and (< arg 0) (bobp) (save-excursion (end-of-visible-line) (bobp)))
      (signal 'beginning-of-buffer nil))
  (unless (eq last-command 'copy-region-as-kill)
    (kill-new "")
    (setq last-command 'copy-region-as-kill))
  (cond ((zerop arg)
         (save-excursion
           (copy-region-as-kill (point) (progn (forward-visible-line 0) (point)))
           (copy-region-as-kill (point) (progn (end-of-visible-line) (point)))))
        ((< arg 0)
         (save-excursion
           (copy-region-as-kill (point) (progn (end-of-visible-line) (point)))
           (copy-region-as-kill (point)
                                (progn (forward-visible-line (1+ arg))
                                       (unless (bobp) (backward-char))
                                       (point)))))
        (t
         (save-excursion
           (copy-region-as-kill (point) (progn (forward-visible-line 0) (point)))
           (copy-region-as-kill (point)
                                (progn (forward-visible-line arg) (point))))))
  (message (substring (car kill-ring-yank-pointer) 0 -1)))
