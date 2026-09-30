window.CONFIG = {
  name: "Prih",
  coupler: "711",
  normRange: [500, 2000],
  autoEqDefaults: { count: 8, fmin: 20, fmax: 8000, gmin: -10, gmax: 6, qmin: 0.1, qmax: 1.5 },
  targets: [
    { group: "Reference",  name: "ISO 11904-1 DF",     file: "targets/∆ ISO 11904-1 DF Target.txt", adjustable: true },
    { group: "Reference",  name: "ISO DF Harman Bass", file: "targets/ISO DF Harman Bass 711.txt",  adjustable: true },
    { group: "Reference",  name: "PEQdB Diamond β",    file: "targets/PEQdB Diamond β.txt" },
    { group: "Reference",  name: "Harman IE 2019 v2",  file: "targets/Harman IE 2019v2 Target.txt", adjustable: true },
    { group: "Reference",  name: "Prih Target",        file: "targets/Prih Target.txt", default: true },
    { group: "Preference", name: "JM1",                file: "targets/JM1.txt", adjustable: true },
    { group: "Preference", name: "Harman IE 2017",     file: "targets/Harman IE 2017.txt", adjustable: true }
  ],
  hps: [
    // { name: "HIFIMAN Sundara", source: "pw", file: "data/HIFIMAN Sundara/HIFIMAN Sundara.csv" },
    // { name: "Moondrop Aria",   source: "boizoff", L: "data/Moondrop Aria/L.csv", R: "data/Moondrop Aria/R.csv" }
  ]
};
