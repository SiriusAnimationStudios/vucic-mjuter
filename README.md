# Vučić Mjuter

**Jedini način da ne slušaš Vučića tokom Narodne skupštine.**

Chrome ekstenzija koja utišava YouTube tab dok se u slici videa pojavljuju izabrane reči (npr. TV natpis sa imenom i strankom na dnu ekrana) i vraća zvuk kada nestanu.

Čita donji deo videa pomoću OCR-a (Tesseract, srpska ćirilica + latinica), u potpunosti na tvom računaru. Ništa se nikuda ne šalje.

Radi i dok si na drugom tabu, dok je Chrome minimizovan ili dok je prozor prekriven drugim programom.

## Instalacija (2 minuta)

1. Na ovoj stranici klikni zeleno dugme **Code** → **Download ZIP**.
   Raspakuj ga negde gde ga nećeš obrisati (npr. `Documents\vucic-mjuter`). Chrome učitava ekstenziju iz tog foldera svaki put.
2. U Chrome-u otvori `chrome://extensions`.
3. Uključi **Developer mode** (gore desno).
4. Klikni **Load unpacked** (gore levo) i izaberi raspakovani folder, onaj u kome se direktno nalazi `manifest.json`.
5. Klikni ikonicu slagalice pored adresne trake i zakači (pin) **Vučić Mjuter**.
6. Osveži YouTube tab koji je već bio otvoren (F5), pusti prenos i klikni crvenu ikonicu da vidiš kako radi.

Za ažuriranje kasnije: skini novi ZIP, zameni sadržaj foldera i klikni dugme za osvežavanje ↻ na ekstenziji u `chrome://extensions`.

## Podešavanja (klikni ikonicu ekstenzije)

| Podešavanje | Podrazumevano | Šta radi |
|---|---|---|
| Reči | `Вучић`, `Србија побеђује` | Utišava kada se bilo koja od njih vidi na ekranu. Jedna reč po redu; ćirilica i latinica se poklapaju (`Vučić` = `Вучић`). |
| Skeniraj od / do % | 85–100 | Koji vodoravni pojas videa se čita. |
| Boja teksta | Svetao na tamnom | Izaberi "Taman na svetlom" za crne natpise na svetloj traci. |
| Skeniraj svakih | 1 s | Koliko često se čita slika. |
| Vrati zvuk posle | 10 s | Vraća zvuk kada reči nema toliko sekundi zaredom. 0 = ostaje utišano. |
| Toleriši OCR greške | Uključeno | Dozvoljava par pogrešno pročitanih slova u dužim rečima. |

Prozorčić ekstenzije prikazuje tačno onu sliku koju OCR čita i tekst koji je pronašao, pa možeš da pomeriš pojas ako tvoj prenos stavlja natpise negde drugde.

Ako ručno vratiš zvuk dok su reči još na ekranu, ekstenzija čeka da nestanu pre nego što ponovo utiša.

## Brzina

- Utišava oko 1 s nakon što se natpis pojavi.
- Vraća zvuk oko 10 s nakon što natpis nestane. Svaki put kad ponovo vidi reči, odbrojavanje kreće od nule, tako da kratke greške u čitanju (npr. zbog pozadine koja se menja) ne vraćaju zvuk.

## Zasluge

OCR pokreće [Tesseract.js](https://github.com/naptha/tesseract.js) (licenca Apache-2.0) sa Tesseract jezičkim podacima za srpski.
