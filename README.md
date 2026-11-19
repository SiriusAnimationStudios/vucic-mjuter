# Vučić Mjuter

**Jedini način da ne slušaš Vučića tokom Narodne skupštine.**

Ovo je Chrome ekstenzija koja utišava YouTube tab kada se na ekranu pojavi bilo ko iz SNS stranke.

## Instalacija (2 minuta)

1. Na ovoj stranici klikni zeleno dugme **Code** → **Download ZIP**.
   Raspakuj ga negde gde ga nećeš obrisati (npr. `Documents\vucic-mjuter`). Chrome učitava ekstenziju iz tog foldera svaki put.
2. U Chrome-u otvori `chrome://extensions`.
3. Uključi **Developer mode** (gore desno).
4. Klikni **Load unpacked** (gore levo) i izaberi raspakovani folder, onaj u kome se direktno nalazi `manifest.json`.
5. Klikni ikonicu slagalice pored adresne trake i zakači (pin) **Vučić Mjuter**.
6. Osveži YouTube tab koji je već bio otvoren (F5) i pusti prenos.
7. Uživaj.

Za ažuriranje kasnije: skini novi ZIP, zameni sadržaj foldera i klikni dugme za osvežavanje ↻ na ekstenziji u `chrome://extensions`.

## Šta utišava

Svakog govornika čiji natpis na dnu ekrana sadrži „Вучић“ ili „Србија побеђује“.

## Uključivanje i isključivanje

Klikni ikonicu ekstenzije, pa dugme preko Vučićevih usta:
- crveno (zvučnik sa X): ekstenzija radi i utišava,
- zeleno (zvučnik sa talasima): ekstenzija je isključena i zvuk se čuje.

## Brzina

- Utišava oko 1 s nakon što se natpis pojavi.
- Vraća zvuk oko 10 s nakon što natpis nestane. Svaki put kad ponovo vidi reči, odbrojavanje kreće od nule, tako da kratke greške u čitanju (npr. zbog pozadine koja se menja) ne vraćaju zvuk.

## Starija verzija sa podešavanjima

Verzija 1.4 sa svim podešavanjima i prikazom šta OCR čita (za razvoj) nalazi se na grani [`dev-v1.4`](../../tree/dev-v1.4).

## Zasluge

OCR pokreće [Tesseract.js](https://github.com/naptha/tesseract.js) (licenca Apache-2.0) sa Tesseract jezičkim podacima za srpski.
