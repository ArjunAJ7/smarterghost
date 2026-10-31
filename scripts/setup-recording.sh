#!/bin/bash
# One-time recording setup for the demo (run after any sandbox wipe):
# installs Noto Color Emoji so emoji render in headless Chrome.
set -e
mkdir -p ~/.fonts
cd /tmp
apt-get download fonts-noto-color-emoji >/dev/null 2>&1
dpkg -x fonts-noto-color-emoji_*.deb /tmp/noto
cp /tmp/noto/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf ~/.fonts/
fc-cache -f ~/.fonts
echo "emoji font installed"
