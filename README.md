# Efsane Çağrısı 🐉

Mobil (ve her modern tarayıcı) için bir **idle RPG / gacha takım kurma**
oyunu — AFK Arena, Summoners War gibi türlerden ilham alındı, ancak tüm
görseller, isimler ve kod tamamen özgün.

Tamamen **vanilla HTML/CSS/JS** — build aracı, framework veya harici
bağımlılık yok. PWA olarak paketlendi: Safari'den **Paylaş → Ana Ekrana
Ekle** ile gerçek bir uygulama gibi kurulabilir, internetsiz de çalışır.

## Oynanış

- **Çağırma (gacha)**: iki banner — 🎫 **Standart** (bilet ile, sıradan/
  nadir/epik) ve 💎 **Efsane Çağırısı** (elmas ile, efsanevi dahil tüm
  nadirlikler). Her ikisinde de **pity (garanti) sistemi** var: 10 çekimde
  bir garanti epik+, efsane bannerında 40 çekimde bir garanti efsanevi.
- **12 özgün kahraman**: 5 rol (tank/savaşçı/suikastçı/büyücü/şifacı), 3
  element (ateş/su/doğa, üçgen avantajlı), 4 nadirlik kademesi.
- **Tekrar çağırma → parça → yıldız atlatma**: sahip olduğun bir
  kahramanı tekrar çekersen parçaya dönüşür; yeterli parça biriktirince
  kahramanın yıldızını (1→6) kalıcı olarak yükseltebilirsin.
- **Seviye atlatma**: altınla kahramanların seviyesini (1→30) yükselt.
- **Takım kurma**: en fazla 5 kahraman; ilk slot ön safta durur, düşman
  saldırılarının çoğunu o karşılar (element/rol stratejisi burada devreye
  girer).
- **Otomatik savaş**: canvas'ta render edilen, iki takımın karşılıklı
  durup otomatik dövüştüğü sahneler — temel saldırılar + doluncaya kadar
  biriken **ultra yetenek** (tank kalkanı, büyücü alan hasarı, şifacı
  toplu iyileştirme, suikastçı çifte vuruş, savaşçı ağır darbe), uçan
  hasar sayıları, parçacık patlamaları, ekran sarsıntısı, 1x/2x hız
  anahtarı.
- **20 bölge** (5 "bölüm" x 4 aşama, her bölümün son aşaması patron
  savaşı), zorluk otomatik ölçeklenir.
- **AFK/boşta kazanç**: uygulamadan uzaktayken bile takımının gücüne göre
  altın/bilet birikir; varsayılan **4 saat** ile sınırlıdır (mağazadan
  kalıcı olarak uzatılabilir).
- **Mağaza (IAP)**: elmas paketleri + tek seferlik başlangıç paketi +
  kalıcı AFK süresi yükseltmesi. **Bu bir demo mağaza** — gerçek ödeme
  alınmaz, arayüzde bu açıkça belirtilir; gerçek para tahsilatı için bir
  ödeme sağlayıcısı (Stripe/RevenueCat vb.) + sunucu taraflı doğrulama
  entegrasyonu gerekir.

## Dosya yapısı

```
index.html    Uygulama iskeleti (ana ekran, kadro, takım, çağırma, bölgeler, mağaza, savaş)
style.css     Tüm görünüm (koyu "fantastik/gacha" tema)
app.js        Veri (kahramanlar/düşmanlar/bölgeler), durum, kayıt, gacha, meta arayüz
battle.js     Otomatik savaş motoru + canvas render döngüsü
manifest.json PWA manifesti
sw.js         Service worker (offline çalışma için önbellekleme)
icons/        Uygulama ikonları (script ile üretildi)
scripts/gen_icons.py  İkonları üreten Python betiği (yalnızca stdlib)
```

## Yerelde çalıştırma

```bash
python3 -m http.server 8080
# tarayıcıda http://localhost:8080 aç
```

## Dengelemeyi ayarlamak

Tüm oyun verisi `app.js`'in başındaki **KAHRAMAN TANIMLARI** / **DÜŞMAN
TANIMLARI** bölümlerinde: `CHARACTER_DEFS`, `ENEMY_DEFS`, `BOSS_DEFS`,
`STAR_MULT`, `RARITY_WEIGHT`, `generateStageEnemies()`. Yeni bir
kahraman eklemek için `CHARACTER_DEFS`'e yeni bir satır eklemek yeterli.

## Kayıt güvenliği — ilerleme asla sıfırlanmaz

`app.js`'teki `SAVE_KEY` ve mevcut kahraman id'leri kalıcı bir
sözleşmedir: bunlar hiçbir güncellemede değiştirilmez. Yeni özellikler
her zaman `freshState()`'e **eklenerek** tanıtılır; `loadState()` eski
bir kayıtta bulunmayan alanları otomatik olarak güvenli varsayılanla
doldurur, mevcut hiçbir veriyi silmez. Tek istisna, Ayarlar sekmesindeki
**"Oyunu Sıfırla"** butonudur — bu tamamen kullanıcının kendi tercihiyle,
iki onay adımından geçerek tetiklenir.

## Ticari kullanım / gerçek ödeme entegrasyonu

Mağaza ekranı gerçek bir mobil oyunun IAP akışını (paketler, "en popüler"
etiketleri, tek seferlik başlangıç paketi) birebir taklit eder, ancak
**satın alma demo modundadır** — buton onaylanınca elmaslar doğrudan
hesaba eklenir, gerçek para tahsil edilmez. Gerçek para ile satış açmak
için: (1) bir ödeme sağlayıcısı hesabı (Stripe önerilir) + API
anahtarları, (2) satın alımı doğrulayacak bir sunucu/backend (bu proje
şu an sunucusuz, tamamen tarayıcıda çalışıyor), (3) mobil bir kabuğa
(Capacitor vb.) sarılacaksa Apple/Google'ın kendi uygulama-içi satın alma
sistemleriyle entegrasyon gerekir.

## Gizlilik

Oyun tamamen tarayıcıda çalışır. Hiçbir veri bir sunucuya gönderilmez;
ilerleme yalnızca cihazının `localStorage`'ında tutulur.
