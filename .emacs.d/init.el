
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

(setq auto-mode-alist
  (append '(("\\.gitconfig\\'" . gitconfig-mode)
            ("\\.gitignore\\'" . gitignore-mode)
            ("\\.gitattributes\\'" . gitattributes-mode)
            ("\\.fish\\'" . fish-mode)
            ("\\.rake\\'" . ruby-mode)
            ("Gemfile\\'" . ruby-mode)
            ("Capfile\\'" . ruby-mode))
          auto-mode-alist))

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
