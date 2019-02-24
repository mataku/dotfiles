;; M-x eval-buffer
(require 'package)

(add-to-list 'package-archives '("melpa" . "https://melpa.org/packages/"))
(package-initialize)

;; パッケージ情報の更新
(package-refresh-contents)

;; インストールするパッケージ
(defvar my/favorite-packages
  '(
    bind-key dash drag-stuff exec-path-from-shell

    expand-region f flycheck htmlize idle-highlight-mode

    multiple-cursors nyan-mode pallet popwin prodigy projectile

    s smartparens smex web-mode yasnippet fish-mode company-emoji

    gitignore-mode gitattributes-mode gitconfig-mode
    
    powerline ruby-end nlinum markdown-mode kotlin-mode slim-mode

    robe ruby-mode neotree yaml-mode go-mode company-go flycheck with-editor
    ))

(dolist (package my/favorite-packages)
  (unless (package-installed-p package)
    (package-install package)))
