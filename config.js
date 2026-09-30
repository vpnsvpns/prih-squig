window.CONFIG = {
    siteTitle: "Prih Squiglink",
    brandName: "Prih",
    
    // Тёмная тема по умолчанию
    defaultTheme: "dark",

    // Панель быстрых действий сверху
    headerButtons: [
        { id: "average-all", label: "Average All", action: "averageAll" },
        { id: "screenshot", label: "Screenshot", action: "screenshot" },
        { id: "copy-url", label: "Copy URL", action: "copyUrl" }
    ],

    // Параметры алгоритма AutoEQ
    autoEq: {
        numFilters: 8,
        minFreq: 20,
        maxFreq: 8000,
        minGain: -10,
        maxGain: 6,
        minQ: 0.1,
        maxQ: 1.5,
        defaultProfile: {
            filters: 8,
            freqRange: [20, 8000],
            gainRange: [-10, 6],
            qRange: [0.1, 1.5]
        }
    },

    // Разделение таргетов
    targets: {
        reference: [
            { id: "iso-11904-1-df", name: "ISO 11904-1 DF", file: "targets/ISO 11904-1 DF.txt", adjustable: true },
            { id: "iso-df-harman-bass", name: "ISO DF Harman Bass", file: "targets/ISO DF Harman Bass.txt" },
            { id: "peqdb-diamond-b", name: "PEQdB Diamond β", file: "targets/PEQdB Diamond β.txt" },
            { id: "harman-ie-2019", name: "Harman IE 2019", file: "targets/Harman IE 2019.txt" },
            { id: "prih-target", name: "Prih Target", file: "targets/Prih Target.txt" }
        ],
        preference: [
            { id: "jm1", name: "JM-1", file: "targets/JM-1.txt" },
            { id: "harman-ie-2017", name: "Harman IE 2017", file: "targets/Harman IE 2017.txt" }
        ]
    },

    // Preference Adjustments (регулировка кривой DF: Bass shelf / Tilt / Ear gain)
    preferenceAdjustments: {
        enabledFor: ["iso-11904-1-df"],
        controls: [
            { id: "bass-boost", label: "Bass (dB)", type: "shelf", freq: 105, min: 0, max: 12, step: 0.5, default: 0 },
            { id: "tilt", label: "Tilt (dB/oct)", type: "tilt", min: -2, max: 1, step: 0.1, default: 0 },
            { id: "ear-gain", label: "Ear Gain (dB)", type: "peak", freq: 3000, q: 1.41, min: -4, max: 4, step: 0.5, default: 0 }
        ]
    }
};