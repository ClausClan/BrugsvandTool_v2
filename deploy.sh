#!/bin/sh

# Stop ved fejl
set -e

# Vi bruger den indbyggede velfungerende Apple Git-sti til at undgå "Bad CPU type" fejlen på din Mac
GIT_PATH="/usr/bin/git"

echo "🔨 Bygger appen..."
npm run build

echo "📁 Går til dist-mappen..."
cd dist

echo "🌐 Initialiserer midlertidigt Git-repository i dist med $GIT_PATH..."
# Fjern evt. gammel lokal git-historik i dist for at undgå konflikter
rm -rf .git
$GIT_PATH init
$GIT_PATH checkout -b gh-pages
$GIT_PATH add -A
$GIT_PATH commit -m "Udgivelse til GitHub Pages"

echo "🚀 Pusher ændringer til ClausClan/BrugsvandTool_v2 på GitHub..."
$GIT_PATH push -f https://github.com/ClausClan/BrugsvandTool_v2.git gh-pages

echo "✅ Færdig! Din app er nu udgivet til GitHub Pages."
