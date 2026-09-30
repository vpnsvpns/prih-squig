window.CONFIG = {
  name: "Prih",
  coupler: "711",

  // диапазон нормализации кривых
  normRange: [500, 2000],

  // пресеты Auto EQ по умолчанию
  autoEqDefaults: {
    count: 8,          // 8 фильтров
    fmin: 20, fmax: 8000,
    gmin: -10, gmax: 6,
    qmin: 0.1, qmax: 1.5
  },

  // group: "Reference" = референсы, "Preference" = преференсы
  // adjustable: true — таргет можно править в Preference adjustments
  targets: [
    { group: "Reference",  name: "ISO 11904-1 DF",     file: "targets/∆ ISO 11904-1 DF Target.txt", adjustable: true },
    { group: "Reference",  name: "ISO DF Harman Bass", file: "targets/ISO DF Harman Bass 711.txt",  adjustable: true },
    { group: "Reference",  name: "PEQdB Diamond β",    file: "targets/PEQdB Diamond β.txt" },
    { group: "Reference",  name: "Harman IE 2019 v2",  file: "targets/Harman IE 2019v2 Target.txt", adjustable: true },
    { group: "Reference",  name: "Prih Target",        file: "targets/Prih Target.txt", default: true },
    { group: "Preference", name: "JM1",                file: "targets/JM1.txt" },
    { group: "Preference", name: "Harman IE 2017",     file: "targets/Harman IE 2017.txt" }
  ],

  // Замеры: только 711. Источник: pw / boizoff / gudkov (squig.link)
  // Два формата на выбор:
  //   1 файл:  { name:"...", source:"pw", file:"data/Имя/Имя.csv" }      — CSV: freq,L,R
  //   2 файла: { name:"...", source:"pw", L:"data/Имя/L.csv", R:"data/Имя/R.csv" } — CSV: freq,dB
  // В поиске строка выглядит как «Имя наушников ............ источник»
  hps: [
    // Пример (замени на реальные замеры, скачанные со скигов):
    // { name: "HIFIMAN Sundara",  source: "pw",      file: "data/HIFIMAN Sundara/HIFIMAN Sundara.csv" },
    // { name: "Moondrop Aria",    source: "boizoff", L: "data/Moondrop Aria/L.csv", R: "data/Moondrop Aria/R.csv" },
    // { name: "Truthear Hexa",    source: "gudkov",  file: "data/Truthear Hexa/Truthear Hexa.csv" }
  ]
};