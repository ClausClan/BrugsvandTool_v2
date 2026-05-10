#!/bin/sh

# Stop ved fejl
set -e

echo "🔨 Bygger appen..."
npm run build

echo "📁 Går til dist-mappen..."
cd dist

echo "🌐 Initialiserer midlertidigt Git-repository i dist..."
# Fjern evt. gammel lokal git-historik i dist for at undgå konflikter
rm -rf .git
git init
git checkout -b gh-pages
git add -A
git commit -m "Udgivelse til GitHub Pages"

echo "🚀 Pusher ændringer til ClausClan/BrugsvandTool_v2 på GitHub..."
git push -f https://github.com/ClausClan/BrugsvandTool_v2.git gh-pages

echo "✅ Færdig! Din app er nu udgivet til GitHub Pages."
