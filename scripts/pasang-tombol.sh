#!/data/data/com.termux/files/usr/bin/sh
# Puts the "Caeno" button (scripts/caeno.sh + icon) where Termux:Widget looks for it.
# Safe to run again; jalan.sh runs it on every start so updates reach the button.

cd "$HOME/kantin" || exit 0
mkdir -p "$HOME/.shortcuts/icons"
cp scripts/caeno.sh "$HOME/.shortcuts/Caeno" && chmod 700 "$HOME/.shortcuts/Caeno"
[ -f scripts/caeno.png ] && cp scripts/caeno.png "$HOME/.shortcuts/icons/Caeno.png"
exit 0
