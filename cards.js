/*
  FRENZYGOLDIES CARD DATABASE
  -------------------------------------------------
  Yeni kart eklemek için aşağıdaki yapıyı kopyalayıp
  cards dizisinin içine ekle.

  image: "assets/cards/dosya-adi.jpg"
  dosya adının assets/cards klasöründeki gerçek dosya adıyla
  birebir aynı olduğundan emin ol.
*/

const cards = [
  {
    id: 1,
    player: "Cooper Flagg",
    team: "Dallas Mavericks",
    category: "Basketball",
    year: "2025-26",
    set: "Panini Prizm Monopoly",
    cardNumber: "Rookie",
    parallel: "Base",
    condition: "Raw",
    grade: "—",
    price: "600 TL",
    acquired: "2026",
    rookie: true,
    featured: true,
    image: "assets/cards/cooper-flagg.svg",
    note: "Koleksiyondaki ilk Cooper Flagg rookie kartlarımdan biri."
  },
  {
    id: 2,
    player: "Dylan Harper",
    team: "San Antonio Spurs",
    category: "Basketball",
    year: "2025-26",
    set: "Rookie Card",
    cardNumber: "RC",
    parallel: "Base",
    condition: "Raw",
    grade: "—",
    price: "277 TL",
    acquired: "2026",
    rookie: true,
    featured: true,
    image: "assets/cards/dylan-harper.svg",
    note: "Toplam üç Dylan Harper rookie kartımdan biri."
  },
  {
    id: 3,
    player: "Cristiano Ronaldo",
    team: "Portugal",
    category: "Football",
    year: "2024",
    set: "Topps UEFA Euro",
    cardNumber: "—",
    parallel: "Captain Green",
    condition: "Raw",
    grade: "—",
    price: "Collection",
    acquired: "2024",
    rookie: false,
    featured: true,
    image: "assets/cards/ronaldo.svg",
    note: "Koleksiyondaki favori futbol parçalarımdan biri."
  },
  {
    id: 4,
    player: "Victor Wembanyama",
    team: "San Antonio Spurs",
    category: "Basketball",
    year: "2023-24",
    set: "Rookie Card",
    cardNumber: "RC",
    parallel: "Base",
    condition: "Raw",
    grade: "—",
    price: "Collection",
    acquired: "2024",
    rookie: true,
    featured: true,
    image: "assets/cards/wembanyama.svg",
    note: "Modern basketball koleksiyonunun merkezindeki rookie isimlerinden biri."
  },
  {
    id: 5,
    player: "Jude Bellingham",
    team: "England / Real Madrid",
    category: "Football",
    year: "2024",
    set: "Topps Euro",
    cardNumber: "—",
    parallel: "Energy",
    condition: "Raw",
    grade: "—",
    price: "Collection",
    acquired: "2024",
    rookie: false,
    featured: false,
    image: "assets/cards/bellingham.svg",
    note: "Euro 2024 döneminden koleksiyonda tuttuğum Bellingham kartı."
  },
  {
    id: 6,
    player: "Kobe Bryant",
    team: "Los Angeles Lakers",
    category: "Basketball",
    year: "Modern / Vintage",
    set: "Basketball Card",
    cardNumber: "—",
    parallel: "Base",
    condition: "Raw",
    grade: "—",
    price: "Collection",
    acquired: "—",
    rookie: false,
    featured: false,
    image: "assets/cards/kobe.svg",
    note: "Örnek kayıt. Kendi kartınla değiştirerek kullanabilirsin."
  }
];
