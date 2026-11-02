# Kart Arenası

Türkiye'nin sevilen kart ve masa oyunlarını arkadaşlarla online ya da bilgisayara karşı oynatan platform.
Telefon, tablet ve bilgisayarda çalışır. Android APK olarak kurulur, tarayıcıda PWA olarak da açılır.

**Sürüm 1.0 — 31 oyunun tamamı oynanabilir.** Bilgisayara karşı (kolay/orta/zor) ve arkadaşlarla online.

| Aşama | Oyunlar |
|---|---|
| 1 | Ana ekran, oyun galerisi, profil, arkadaşlar, odalar |
| 2 | Pişti, Eşli Pişti, Batak, İhaleli Batak, Papaz Kaçtı |
| 3 | Tavla, Satranç, Kızma Birader |
| 4 | Scrabble Türkçe, Scrabble İngilizce, Çin Daması, Çin Satrancı (Xiangqi) |
| 5 | Klasik Okey, 101 Okey, 51, Yanık |
| 6 | Monopoli, Amiral Battı, Tombala |
| 7 | King, Pis Yedili, Briç, Blöf, Dost Kazığı, Eşli Batak, Koz Maça, Gömmeli Batak |
| 8 | Poker (5 kart), Texas Hold'em, Omaha, Blackjack — yalnızca sanal fişle |

Gerçek para ile oynanmaz.

---|---|---|
| 1 | Ana ekran, profil, arkadaşlar, odalar | Tamam |
| 2 | Pişti, Eşli Pişti, Batak (İhaleli), Papaz Kaçtı | Tamam |
| 3 | Tavla, Satranç, Kızma Birader | Tamam |
| 4 | Scrabble Türkçe, Scrabble İngilizce, Çin Daması, Çin Satrancı (Xiangqi) | Tamam |
| 5 | Klasik Okey, 101 Okey, 51 | Tamam |
| 5 | Yanık | Kuralların onaylanması bekleniyor |
| 6 | Amiral Battı, Tombala, Monopoli | Tamam |
| 7 | Eşli Batak, Blöf, King | Tamam |
| 7 | Briç | Sırada |
| 7 | Pis Yedili, Dost Kazığı, Koz Maça, Gömmeli Batak | Kuralların onaylanması bekleniyor |
| 8 | Poker, Texas Hold'em, Omaha, Blackjack | Sırada |

Hazır olmayan oyunlar ana sayfada aşama numarasıyla listelenir; tıklanıp boşa çıkan düğme yoktur.

Gerçek para ile oynanmaz.

---

## 1. APK'yı GitHub ile oluşturma (adım adım)

### Hazırlık
1. github.com adresinde oturum açın.
2. Sağ üstteki **+** → **New repository** seçin.
3. Ad olarak `kart-arenasi` yazın. **Public** ya da **Private** seçebilirsiniz.
4. **Create repository** düğmesine basın.

### Zip dosyasını yükleme
5. Açılan sayfada **uploading an existing file** bağlantısına tıklayın.
6. `KartArenasi.zip` dosyasını sürükleyip bırakın. Zip'i açmayın, olduğu gibi yükleyin.
7. **Commit changes** düğmesine basın.

### İş akışı dosyasını ekleme
GitHub, zip içindeki iş akışını göremez. Bu dosyayı bir kez elle eklemeniz gerekir.

8. Depo sayfasında **Add file** → **Create new file** seçin.
9. Dosya adı kutusuna tam olarak `.github/workflows/android.yml` yazın. Eğik çizgiler klasörleri otomatik oluşturur.
10. Ayrı verilen `android.yml` dosyasının içeriğini kopyalayıp yapıştırın.
11. **Commit changes** düğmesine basın.

### APK'yı indirme
12. Üst menüden **Actions** sekmesine gidin. **Kart Arenası APK** çalışması otomatik başlar ve yaklaşık 8–12 dakika sürer.
13. Yeşil tik çıkınca çalışmaya tıklayın.
14. Sayfanın altındaki **Artifacts** bölümünden **KartArenasi-APK** dosyasını indirin.
15. İnen zip'in içindeki `KartArenasi.apk` dosyasını telefona atın ve açın. Android "bilinmeyen kaynak" izni isterse **Bu kaynaktan izin ver** deyin.

### Dikkat edilecekler
- **Sonraki aşamalar:** Yeni zip'i aynı adla yükleyip eskisinin üzerine yazmanız yeterli. İş akışı her yüklemede APK'yı yeniden üretir.
- **Testler:** İş akışı APK'dan önce bütün testleri çalıştırır. Bir test başarısız olursa APK üretilmez. Bu bilerek böyle kurgulandı: bozuk sürüm telefona gitmez.

---

## 2. Online oyun sunucusu — Cloudflare Workers (ücretsiz, kart gerektirmez)

Sunucu Cloudflare Workers üzerinde çalışır: tüm masalar tek bir Durable Object içinde yaşar,
hesaplar onun kalıcı deposunda saklanır, web uygulaması ve sözlükler aynı adresten sunulur.
APK varsayılan olarak `https://kart-arenasi.salihtasdemir35.workers.dev` adresine bağlanır.

1. GitHub iş akışı (bölüm 1) en az bir kez yeşil tikle bitmiş olmalı; depoda `kaynak` dalı oluşur.
2. dash.cloudflare.com → **Workers & Pages** → **Create** → **Import a repository**.
3. GitHub hesabını bağla ve `kart-arenasi` deposunu seç.
4. Proje adı: **kart-arenasi** (wrangler.jsonc içindeki adla aynı olmalı).
5. **Build command:** `npm ci && npm run build:web` — **Deploy command:** `npx wrangler deploy`.
6. Kaydet ve dağıt. İlk derleme `main` dalında başarısız olursa: Projenin **Settings → Build → Branch control**
   bölümünde üretim dalını **kaynak** yap ve **Retry deployment** de.
7. Adres `https://kart-arenasi.<hesap-adın>.workers.dev` olur. Farklıysa uygulamada
   **Profil → Ayarlar → Sunucu adresi** alanına yaz ya da GitHub'da `SERVER_URL` değişkeni tanımla.

Ücretsiz plan sınırları (günlük istek ve süre kotaları) arkadaşlar arası oyun için fazlasıyla yeterlidir.

Kendi bilgisayarında çalıştırmak istersen: `npm run build && npm start` (Node.js 20+).

## 3. Bilgisayarda geliştirme

Node.js 20 veya üstü gerekir.

```bash
npm install
npm test               # 65 otomatik test
npm run typecheck
npm run dev:server     # http://localhost:3000
npm run dev:client     # http://localhost:5173 (sunucuya otomatik bağlanır)
npm run build && npm start   # üretim derlemesi: http://localhost:3000
```

Sunucu ortam değişkenleri:

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `PORT` | Sunucu portu | 3000 |
| `DATA_FILE` | Veri dosyası | `data/kart-arenasi.json` |
| `BOT_DELAY_MS` | Bot hamle gecikmesi | 700 |
| `RECONNECT_GRACE_MS` | Kopan oyuncunun geri dönme süresi | 60000 |
| `DICT_DIR` | Scrabble sözlüklerinin klasörü | `apps/client/public/dict` |

Cloudflare'i yerelde denemek için: `npm run build:web && npx wrangler dev`.

---

## 4. Mimari

```
packages/engine     Oyun motorları (saf TypeScript, istemci ve sunucu ortak kullanır)
  src/games/        pisti.ts, batak.ts, papaz.ts — her biri GameModule sözleşmesine uyar
  src/catalog.ts    31 oyunluk katalog ve aşama bilgisi
  test/             Kural testleri + binlerce yapay zekâ maçlık simülasyon
apps/server         Oyun çekirdeği (hub.ts) + Node sunucusu (Express + WebSocket)
apps/worker         Cloudflare Workers + Durable Object sunucusu (aynı çekirdek)
apps/client         React + TypeScript + Tailwind + Framer Motion, Capacitor ile Android
assets/             İkon, açılış ekranı, mağaza kapak görseli ve üretim betiği
```

### Her oyun aynı sözleşmeye uyar
- **`setup` / `apply`:** Durum yalnızca `apply` ile değişir. Geçersiz hamle `IllegalMoveError` fırlatır.
- **`view(state, koltuk)`:** Gizli bilgiyi süzer. Rakip elleri, deste sırası ve kapalı yer kartları gönderilmez.
- **`ai(view, ...)`:** Yapay zekâ yalnızca kendi görünümünü alır. Bu yüzden yapısı gereği hile yapamaz.

### Online güvenlik
- **Tek doğruluk kaynağı:** Online oyunda durum yalnızca sunucuda tutulur.
- **Rastgelelik:** Dağıtım, karıştırma ve kart çekme `crypto.randomInt` ile yapılır.
- **Hamle doğrulama:** Her hamle sunucuda kontrol edilir; sıra dışı ya da kural dışı hamle reddedilir.
- **Şifreler:** Kullanıcı şifreleri ve masa şifreleri scrypt ile saklanır.
- **Hız sınırı:** Girişte IP başına dakikada 20 deneme, sokette 5 saniyede 40 olay.

### Henüz yapılmayanlar
Belgedeki teknoloji listesinde PostgreSQL ve Redis var. Bu sürümde veriler aynı arayüzün arkasında bir JSON dosyasında tutuluyor. Postgres/Redis bağdaştırıcısı, çoklu sunucu ölçeklemesiyle birlikte Aşama 9'da eklenecek.

---

## 5. Uygulanan kurallar

Belgenin 16. maddesi gereği aşağıdaki kural seçimleri **onayınızı bekliyor**. Farklı oynuyorsanız motor değiştirilir. Kuralların tamamı oyun içindeki **Kurallar** düğmesinde de görünür.

### Pişti
- **Kart puanları:** As 1, Vale 1, Sinek 2 = 2, Karo 10 = 3.
- **Çoğunluk:** En çok kart alan 3 puan alır.
- **Pişti puanı:** Normal pişti 10, Vale üstüne Vale ile pişti 20 puan.
- **Açılış kartı:** Yerdeki açık kart Vale çıkarsa desteden değiştirilir.
- **Oyun sonu:** Tek el ya da 51 / 101 / 151 puana kadar.

### Batak (ihaleli, tekli)
- **İhale:** En az 4 (ayardan 5 yapılabilir). Herkes pas derse dağıtan alır.
- **Koz açma:** Koz kırılmadan kozla el açılamaz.
- **Zorunlu oyun:** Renge uymak, yükseltmek, rengin yoksa koz atmak ve kozu geçebiliyorsan geçmek zorunludur.
- **Puanlama:** İhaleci tutarsa aldığı el kadar artı, tutamazsa ihale kadar eksi yazar. Diğerleri aldıkları el kadar artı yazar.
- **Onay bekleyen konu:** Hiç el almayan oyunculara ceza uygulanmıyor.

### Tavla
- Klasik düzen; açılışta büyük zarı atan başlar ve o zarları oynar; çift zarda dört hamle.
- Kırma, bar, kapalı kapı; zarların oynanabilen en fazlası zorunlu, tek zar oynanabiliyorsa büyüğü.
- Normal 1, mars 2, katmerli mars 3 puan. Maç 1/3/5/7 puana. Teslim olma ve online oyun saati var.

### Satranç
- FIDE kuralları: rok, geçerken alma, terfi seçimi, mat, pat, 50 hamle, üç kez tekrar (otomatik beraberlik), yetersiz materyal.
- Online maçta 3/5/10/15 dakikalık oyun saati; süresi biten kaybeder. Teslim olma.

### Kızma Birader
- 6 ile taş çıkar ve tekrar atılır; oynanabilir taş yoksa 3 deneme. 6 atıp evde taşın varsa çıkarmak zorunlu.
- Rakibin üstüne gelinirse rakip başa döner; ev yolu güvenli, tam zar ister. İlk dört taşını sokan kazanır.

### Çin Daması
- 2, 3, 4, 6 oyuncu; 10'ar taş. Bir adım ya da zincirleme atlama (atlanan taş alınmaz).
- Başkasının köşesinden geçilir ama orada durulamaz. **Onay bekleyen konu:** Hedef köşe tamamen dolu ve içinde en az bir kendi taşın varsa kazanma ("tıkanma" kuralı).

### Çin Satrancı (Xiangqi)
- Saray, nehir, at ayak bağı, fil gözü, top perdesi, yüz yüze generaller kuralı.
- Hamlesi kalmayan kaybeder (mat da pat da). Üç kez tekrar ve 120 hamle taş alınmaması beraberlik.
- **Onay bekleyen konu:** Sürekli şah ve sürekli kovalama yasakları (Asya kuralları) uygulanmıyor; bunun yerine üç kez tekrar beraberlik sayılıyor.

### Scrabble (Türkçe / İngilizce)
- Standart 15×15 tahta ve özel kareler; dile özgü 100 taş ve harf puanları; 2 joker.
- İlk kelime merkezden; bağlantı ve boşluksuzluk kontrolü; hamlede oluşan tüm kelimeler kontrol edilir ve puanlanır; 7 taş bonusu +50.
- Doğrulama: otomatik ya da itirazlı mod. Harf değiştirme, pas, oyun sonu el cezası.
- Öğrenme modu (yalnızca bilgisayara karşı): en iyi kelimeyi gösteren ipucu. İngilizce kelime anlamları internet varken açık sözlük servisinden gelir; Türkçede TDK sözlüğüne bağlantı verilir.
- Sözlükler: Türkçe **hunspell-tr** (Harun Reşit Zafer, MIT) 309.714 kelime; İngilizce **word-list** (MIT) 269.870 kelime. Lisans dosyaları `apps/client/public/dict/` içinde.
- **Onay bekleyen konu:** Türkçe sözlükte kök kelimelerin hepsi ve fiil çekimlerinin bir kısmı var, ancak isim çoğulları ("kitaplar") yok. Tartışmalı durumlar için itirazlı mod önerilir.

### Klasik Okey
- 106 taş, gösterge ve okey; sahte okey okeyin gerçek değerini alır. Dağıtan 15, diğerleri 14 taş.
- Per: aynı renk ardışık (12-13-1 olur, 13-1-2 olmaz) ya da aynı sayı farklı renk; çifte bitiş (7 çift).
- Herkes 20 puanla başlar: bitiş 2, çifte 4, okey atarak 4, okey atarak çifte 8 puan diğerlerinden düşülür; gösterge gösterme 1.
- **Onay bekleyen konu:** Puanlama bölgeden bölgeye değişir; yukarıdaki en yaygın düzen uygulandı.

### 101 Okey (tekli)
- Dağıtan 22, diğerleri 21 taş. El açma: perlerin toplamı en az 101 ya da en az 5 çift; açtıktan sonra per ekleme ve işleme.
- Yandan alınan taş o turda kullanılmalı; kullanılamıyorsa geri bırakılıp ortadan çekilir.
- Ceza: işlek taş ya da okey atmak +101. El sonu: bitiren −101 (okey atarak −202 ve diğerlerine ×2), açmayan +202, açan elindeki toplam (okey 101, çift açan ×2). En düşük toplam kazanır.
- **Onay bekleyen konular:** Masadaki perdeki okeyi gerçek taşla değiştirip alma uygulanmıyor. Eşli 101 ileride eklenecek.

### 51
- 2 deste + 4 joker; 2–4 oyuncu; ilk oyuncu 15, diğerleri 14 kart.
- Per: aynı takımdan ardışık en az 3 kart ya da aynı değerde farklı takımlardan 3–4 kart. As A-2-3'te 1, Q-K-A'da ve gruplarda 11; K-A-2 yok.
- El açma en az 51; açtıktan sonra per ekleme ve işleme. Yerden alınan kart o turda kullanılmalı (kullanılamazsa geri bırakılır).
- Joker atmak +51. El sonu: bitiren −51, açmayan +102, açan elindeki toplam (joker 25). En düşük toplam kazanır.
- **Onay bekleyen konular:** çift ile açma uygulanmıyor; ceza değerleri bölgeye göre değişebilir.

### Amiral Battı
- 10×10 alan; filo 5, 4, 3, 3, 2. Gizli yerleştirme (elle ya da rastgele), sırayla koordinata ateş; ıska, isabet, battı.
- Seçenekler: gemiler birbirine değmesin; isabette tekrar at. Rakip gemileri sunucuda saklanır, yalnızca batanlar görünür.

### Tombala
- 2–20 oyuncu, oyuncu başına 1–3 kart; klasik kart (3 satır × 9 sütun, satır başına 5 numara).
- Numarayı masayı açan oyuncu çeker (sunucuda güvenli rastgele); numaralar otomatik işaretlenir.
- 1. çinko 1, 2. çinko 2, tombala 5 puan; aynı anda tamamlayanlar paylaşır. Sunucu kazananı doğrular.

### Monopoli
- Özgün Türkiye tahtası (İstanbul semtleri, İzmir, Ankara, Bursa, Antalya; dört gar, iki idare). Fiyat/kira tablosu klasik değerlerdedir.
- 2–6 oyuncu, 1.500 TL, Başlangıç 200 TL; çift zarda tekrar, üç çiftte hapis; hapis seçenekleri.
- Satın alma ya da sırayla teklifli müzayede; tam sette ×2 kira; eşit dağılımlı ev/otel (bankada 32 ev, 12 otel); yarı fiyatına ev satışı.
- İpotek ve %10 faizle kaldırma; para ve mülk takası (turda en çok 3 teklif); borç aşaması; oyuncuya ya da bankaya iflas.
- Şans ve Kamu Fonu kartları (16'şar): ilerleme, en yakın gar/idare, geri gitme, hapis, çıkış kartı, ödemeler, tamir.
- Oyun sonu: son kalan kazanır (klasik, 200 turluk güvenlik sınırıyla) ya da 20/40 tur sonunda en zengin.
- **Onay bekleyen konular:** ipotekli mülk takasında %10 faiz uygulanmıyor; Ücretsiz Otopark'ta para birikmiyor (klasik kural).

### Eşli Batak
- İhaleli Batak'ın eşli hâli: karşılıklı oturanlar eştir; ihale takımın ortak sözüdür, eller ve puanlar takım olarak sayılır.

### Blöf
- 3–6 oyuncu, bütün deste dağıtılır; sıradaki değer As'tan Papaz'a döner. 1–4 kart kapalı atılır ve o değer olduğu iddia edilir.
- Sıradaki oyuncu "Blöf!" diyebilir: yalan varsa yığını atan, doğruysa itiraz eden alır. İlk bitiren kazanır.
- **Onay bekleyen konu:** yalnızca sıradaki oyuncu blöf diyebiliyor (online oyunda eşzamanlı bağırma yerine).

### King
- 20 el (kısa seçenek 8 el); her oyuncu 2 kozlu + 3 ceza seçer, her ceza en fazla 2 kez.
- El almaz −50/el, Kupa almaz −30/kupa, Erkek almaz −60/papaz-vale, Kız almaz −100/kız, Rıfkı −320, Son iki −180/el; kozlu +50/el.
- Renge uyma zorunlu; kozluda renk yoksa koz zorunlu; Kupa almaz ve Rıfkı'da kupa kırılmadan kupa açılmaz; ceza kartları bitince el erken biter.
- **Onay bekleyen konular:** ceza kartını "ilk fırsatta atma" zorunluluğu ve kozluda kozu geçme zorunluluğu uygulanmıyor.

### Koz Maça (sözlü batak)
- İhale yok, koz her zaman maça. Herkes sırayla kaç el alacağını söyler (1–13); tutturan aldığı el kadar artı, tutturamayan sözü kadar eksi.
- **Uygulanan yorum** (bölgeye göre değişir): söz tek tur ve rekabetsiz verilir; "batak" cezası söz kadardır.

### Gömmeli Batak
- 3 oyuncu, 16'şar kart, 4 kart gömü. İhaleyi alan gömüyü alıp 4 kart gömer (gömülenler ele sayılmaz), kozu seçer. Puan ihaleli gibi (16 el).

### Pis Yedili
- 2–5 oyuncu, 7'şer kart; takım ya da değer eşleşmesi. Vale her kartın üstüne gider ve takım seçtirir.
- 7: sıradaki 2 çeker (7 ile karşılık verilirse birikir); 8: atan bir kart daha atar; As: sıradaki atlanır; 10: yön değişir.
- Bitiremeyenler ceza yazar (Vale 25, As 11, resimli 10, diğerleri sayısı); Valeyle bitirilirse ×2. En az ceza kazanır.
- **Uygulanan yorum:** özel kartların anlamı bölgeye göre değişir; yukarıdaki en yaygın düzen seçildi.

### Dost Kazığı
- 2–5 oyuncu; herkese 3 kapalı, 3 açık, 3 el kartı. Aynı ya da daha büyük kart atılır; aynı değerden birkaç kart birlikte atılabilir.
- 2 her şeyin üstüne gider; 10 ya da dörtlü yığını yakar ve atan tekrar oynar; atamayan yığını alır. El → açık → kapalı (körlemesine) sırası. Son kalan "kazığı yer".
- **Uygulanan yorum:** bu ad altında oynanan bu "kaybedeni belirleme" oyunu seçildi; başlangıçta açık kart değiştirme turu yok.

### Yanık
- 2–4 oyuncu, 52 kart + 2 joker, 7'şer kart; çek-at. 7 kartın hepsini per yapan son kartı atarak eli bitirir.
- Diğerleri pere giremeyen kartların cezasını yazar (As 11, resimli 10, joker 25). 101'e ulaşan yanar; son kalan kazanır.
- **Uygulanan yorum:** kurallar yerel olarak değiştiğinden en yaygın "yanma" düzeniyle bir el bitirme oyunu olarak uygulandı.

### Briç
- Kontrat briçi, duplicate puanlama; standart 16'lık zon döngüsü. İhale (pas, 1–7 × ♣♦♥♠SA, kontr, sürkontr), yer kartları açılışın ardından açılır ve deklaran oynar.
- Puan tablosu (oyun 300/500, kısmi 50, şlemler, kontrlu batışlar 100-300-500-800 / 200-500-800, fazla eller) tam uygulanır.
- Yapay zekâ doğal (standart) ihale ve basit kart oyunu oynar; uzman konvansiyonlar (Stayman, transfer vb.) yoktur.

### Poker ailesi (sanal fiş)
- Texas Hold'em ve 5 kart çekmeli limitsiz, Omaha pot limitli. Kör 10/20, 1.000 fiş; yan potlar, eşitlikte bölme.
- Omaha'da el tam olarak 2 kapalı + 3 ortak karttan kurulur.

### Blackjack (sanal fiş)
- 6 deste; kasa yumuşak 17'de durur; blackjack 3:2; ikiye katlama, tek bölme (bölünen Aslara tek kart). Sigorta yok.

### Papaz Kaçtı
- **Deste:** Sinek Papaz çıkarılır.
- **Çiftler:** Otomatik olarak atılır.
- **Kart çekme:** Soldaki oyuncunun kapalı elinden çekilir. Kapalı elin sırası her çekişte sunucuda karıştırılır.
- **Kaybeden:** Son papazla kalan oyuncu.

---

## 6. Test raporu

**269 otomatik test** (19 dosya) — hepsi geçiyor ve her APK derlemesinden önce yeniden çalışır.

- **Kural testleri:** her oyunun kendine özgü kuralları ayrı ayrı (ör. satranç ve Xiangqi perft referans değerleri, briç puan tablosu, poker el sıralaması ve yan potlar, Okey per arama algoritması, Monopoli kira/ev/ipotek/iflas, Scrabble Türkçe karakterler ve puanlama).
- **Simülasyonlar:** her oyunda yüzlerce/binlerce yapay zekâ maçı; kart, taş, fiş ve para korunumu; gizli bilginin görünümden sızmaması.
- **Sunucu:** katalogdaki 31 oyunun her biri gerçek soket bağlantısıyla, 1 insan + botlarla sonuna kadar oynanır. Ayrıca hesaplar, şifreli masa, sıra dışı/kural dışı hamle reddi, oyun saati, teslim olma, kopma ve yeniden bağlanma, bot devralma, seyirci gizliliği, arkadaşlar ve davet, hız sınırı.
- **Arayüz:** 31 masanın her biri oyuncu ve seyirci görünümüyle çizilir; dokunmayla doğru hamlenin gönderilmesi oyun oyun test edilir.
- **Tarayıcı (telefon ekranı, Chromium):** 31 oyunun tamamı baştan sona oynandı; ayrıca elle tıklanan senaryolarla bilgisayara karşı ve iki ayrı oturumla online maçlar. Konsol hatası yok.

Testlerin yakaladığı ve düzeltilen gerçek hatalardan bazıları: tek oyuncu sayılı oyunlarda online masa açılmaması, satranç YZ'sinin mat-1'i kaçırması, Okey per aramasında 12-13-1 ve okey yerleşimi, 101'de oyunu kilitleyen yandan alma durumu, rastgele gemi dizmede çakışma, Monopoli'de YZ takas yapmadığı için bitmeyen oyunlar, Blackjack'te güvensiz karıştırma.
