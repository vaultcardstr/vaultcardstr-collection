# FrenzyGoldies Card Collection

A static, responsive personal trading-card showcase made with plain HTML, CSS and JavaScript.

## Dosya yapısı

- `index.html` → sayfa iskeleti
- `style.css` → tüm tasarım
- `cards.js` → koleksiyon verisi; yeni kartları buradan ekle
- `app.js` → filtreleme, arama, modal ve istatistikler
- `assets/cards/` → kart fotoğrafları

## Yeni kart ekleme

1. Kart görselini `assets/cards/` içine koy.
2. `cards.js` içindeki `cards` dizisinin sonuna yeni bir obje ekle.
3. `image` alanını dosya adına göre güncelle.
4. GitHub'a kaydet/push et.
5. GitHub Pages otomatik olarak günceller.

## Yerelde çalıştırma

Python yüklüyse klasörün içinde:

`python -m http.server 8000`

Ardından tarayıcıdan `http://localhost:8000` adresini aç.
