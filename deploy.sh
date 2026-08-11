#!/bin/bash
cd /var/www/divinelink
git pull origin main
VERSION=$(date +%Y%m%d%H%M%S)
sed -i "s/divinelink-BUILD_VERSION/divinelink-$VERSION/g" public/sw.js
npm run build
sed -i "s/divinelink-$VERSION/divinelink-BUILD_VERSION/g" public/sw.js
systemctl restart nginx
echo "✅ Deployed version $VERSION"
