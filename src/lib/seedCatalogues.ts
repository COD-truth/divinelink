// Starter catalogues ("préambule") so staff pick from suggestions instead of
// typing everything. Used as datalist suggestions — never auto-inserted, so they
// never clobber a clinic's own entries. Tuned for Cameroon primary-care clinics.

export const COMMON_DRUGS: string[] = [
  // Antalgiques / anti-inflammatoires
  "Paracétamol 500mg cp", "Paracétamol sirop", "Paracétamol 1g inj", "Ibuprofène 400mg", "Diclofénac 75mg inj", "Acide acétylsalicylique 500mg",
  // Antibiotiques
  "Amoxicilline 500mg", "Amoxicilline + Ac. clavulanique", "Ampicilline inj", "Cotrimoxazole", "Métronidazole 500mg", "Ciprofloxacine 500mg",
  "Ceftriaxone 1g inj", "Gentamicine inj", "Azithromycine 250mg", "Érythromycine", "Doxycycline 100mg",
  // Antipaludiques
  "Artéméther-Luméfantrine (Coartem)", "Artésunate inj", "Quinine", "SP (Sulfadoxine-Pyriméthamine)",
  // Antiparasitaires
  "Albendazole 400mg", "Mébendazole", "Praziquantel",
  // Suppléments
  "Fer + Acide folique", "Acide folique 5mg", "Vitamine C", "Vitamine B complexe", "Multivitamines", "Zinc cp",
  // Digestif
  "SRO (sels de réhydratation)", "Oméprazole 20mg", "Aluminium hydroxyde (Maalox)", "Butylscopolamine (Buscopan)", "Métoclopramide (Primpéran)",
  // Allergie / respiratoire
  "Cétirizine 10mg", "Prométhazine", "Chlorphéniramine", "Salbutamol", "Dexaméthasone inj", "Hydrocortisone inj", "Prednisolone 5mg",
  // Cardio / chronique
  "Amlodipine 5mg", "Nifédipine LP 20mg", "Hydrochlorothiazide 25mg", "Furosémide 40mg", "Méthyldopa (Aldomet)", "Captopril 25mg",
  "Metformine 500mg", "Glibenclamide 5mg",
  // Maternité / urgences
  "Oxytocine inj", "Misoprostol", "Sulfate de magnésium", "Diazépam inj", "Vitamine K inj",
  // Solutés
  "Ringer lactate", "Sérum glucosé 5%", "Sérum salé 0.9%", "Lidocaïne 2%",
];

export const COMMON_REAGENTS: string[] = [
  // Tests de diagnostic rapide
  "TDR Paludisme (RDT)", "TDR VIH 1/2 (Determine)", "TDR VIH confirmation", "TDR Hépatite B (AgHBs)", "TDR Hépatite C",
  "TDR Syphilis", "Test de grossesse (hCG)",
  // Bandelettes
  "Bandelettes glycémie", "Bandelettes urinaires 10 paramètres",
  // Hématologie / sérologie
  "Réactif Widal (antigènes)", "Réactif CRP latex", "Réactif facteur rhumatoïde", "Groupage sanguin (anti-A/B/D)",
  "Giemsa", "May-Grünwald", "Bleu de méthylène", "Lugol",
  // Kits biochimie
  "Kit Glucose", "Kit Créatinine", "Kit Urée", "Kit Transaminases (ASAT/ALAT)", "Kit Acide urique", "Kit Cholestérol",
  // Consommables
  "Tubes EDTA", "Tubes secs", "Tubes citratés", "Lames porte-objet", "Lamelles", "Microcuvettes Hb",
  "Gants latex", "Alcool 70%", "Coton hydrophile", "Eau distillée",
];
