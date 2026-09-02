// DivineLink Survey Templates
// Pre-built surveys for community health fieldwork

import { type Survey, type SurveyQuestion } from "@/lib/db";
import { generateInviteCode } from "@/lib/surveyHelpers";

function q(type: SurveyQuestion["type"], text: string, options?: string[], required = true): SurveyQuestion {
  return {
    id: `q_\${Date.now()}_\${Math.random().toString(36).slice(2,7)}`,
    type, text, required,
    options: options || (type==="single_choice"||type==="multi_choice" ? ["Oui","Non"] : undefined),
    ratingMax: type==="rating" ? 5 : undefined,
  };
}

export const SURVEY_TEMPLATES: { id: string; title: string; description: string; category: string; emoji: string; build: () => Partial<Survey> }[] = [
  {
    id: "malaria_prevalence",
    title: "Enquête Paludisme / Malaria Survey",
    description: "Prévalence du paludisme en milieu communautaire. Idéal pour études épidémiologiques.",
    category: "Epidémiologie",
    emoji: "🦟",
    build: () => ({
      title: "Enquête Paludisme — Prévalence Communautaire",
      description: "Collecte de données sur la prévalence et la prévention du paludisme dans la communauté.",
      surveyType: "malaria",
      questions: [
        q("short_text", "Nom du village / quartier"),
        q("single_choice", "Sexe / Gender", ["Masculin / Male", "Féminin / Female"]),
        q("short_text", "Âge (années / years)"),
        q("single_choice", "Avez-vous eu de la fièvre dans les 2 dernières semaines? / Fever in last 2 weeks?", ["Oui / Yes", "Non / No", "Je ne sais pas / Don't know"]),
        q("single_choice", "Avez-vous fait un test de paludisme? / Did you do a malaria test?", ["Oui positif / Yes positive", "Oui négatif / Yes negative", "Non / No"]),
        q("single_choice", "Dormez-vous sous une moustiquaire? / Do you sleep under a net?", ["Oui, toujours / Yes always", "Parfois / Sometimes", "Non / No"]),
        q("single_choice", "Votre moustiquaire est-elle imprégnée? / Is your net impregnated?", ["Oui / Yes", "Non / No", "Je ne sais pas / Don't know"]),
        q("multi_choice", "Avez-vous reçu des antipaludéens ce mois? / Antimalarials this month?", ["Coartem", "Quinine", "Artéméther", "Aucun / None", "Autre"]),
        q("single_choice", "Avez-vous des enfants de moins de 5 ans? / Children under 5?", ["Oui / Yes", "Non / No"]),
        q("single_choice", "Accès à l'eau potable / Access to clean water?", ["Robinet / Tap", "Puits / Well", "Rivière / River", "Autre"]),
        q("rating", "Accès aux soins de santé dans votre zone (1=très mauvais, 5=excellent)"),
        q("long_text", "Commentaires / Comments", undefined, false),
      ]
    })
  },
  {
    id: "vaccination_coverage",
    title: "Couverture Vaccinale / Vaccination Coverage",
    description: "Évaluation de la couverture vaccinale d'une communauté. Enfants et adultes.",
    category: "Vaccination",
    emoji: "💉",
    build: () => ({
      title: "Enquête Couverture Vaccinale",
      description: "Évaluation de la couverture vaccinale dans la communauté.",
      surveyType: "vaccination",
      questions: [
        q("short_text", "Village / Quartier"),
        q("single_choice", "Cette enquête concerne / This survey is about", ["Un enfant / A child", "Un adulte / An adult"]),
        q("short_text", "Âge de la personne (mois si <2ans / years)"),
        q("single_choice", "Sexe", ["Masculin", "Féminin"]),
        q("single_choice", "L'enfant a-t-il un carnet de vaccination? / Does child have vaccination card?", ["Oui disponible / Yes available", "Oui mais absent / Yes but not here", "Non / No"]),
        q("multi_choice", "Vaccins reçus / Vaccines received", ["BCG", "Polio oral", "Pentavalent (DTC-HepB-Hib)", "Pneumocoque / PCV", "Rotavirus", "Rougeole / Measles", "Méningite / Meningitis", "Fièvre jaune / Yellow fever", "HPV (filles)", "COVID-19", "Aucun / None"]),
        q("single_choice", "Vaccination complète pour l'âge? / Age-appropriate vaccination?", ["Oui / Yes", "Non, manques / No, missing", "Ne sait pas / Unknown"]),
        q("single_choice", "Pourquoi non vacciné? / Why not vaccinated?", ["Pas de vaccin disponible / No vaccine", "Peur des effets / Fear of side effects", "Loin du centre / Far from center", "Pas d'information / Not informed", "N/A - vacciné / N/A - vaccinated"]),
        q("single_choice", "Distance au centre de santé le plus proche?", ["<1km", "1-5km", "5-15km", ">15km"]),
        q("rating", "Satisfaction envers les services de vaccination (1=très mauvais, 5=excellent)"),
      ]
    })
  },
  {
    id: "dental_hygiene",
    title: "Santé Bucco-Dentaire / Oral Health Survey",
    description: "Évaluation de l'hygiène dentaire et accès aux soins dentaires. Parfait pour mission FMSB.",
    category: "Santé Dentaire",
    emoji: "🦷",
    build: () => ({
      title: "Enquête Santé Bucco-Dentaire",
      description: "Évaluation de l'hygiène dentaire et de l'accès aux soins dans la communauté.",
      surveyType: "dental",
      questions: [
        q("short_text", "Village / Quartier"),
        q("single_choice", "Sexe", ["Masculin", "Féminin"]),
        q("short_text", "Âge"),
        q("single_choice", "Combien de fois vous brossez-vous les dents par jour?", ["Jamais", "1 fois", "2 fois", "3 fois ou plus"]),
        q("single_choice", "Avec quoi vous brossez-vous les dents?", ["Brosse + dentifrice", "Brosse sans dentifrice", "Bâton (siwak/cure-dent)", "Doigt", "Autre/Rien"]),
        q("single_choice", "Avez-vous des douleurs dentaires actuellement?", ["Oui, sévères", "Oui, légères", "Non"]),
        q("single_choice", "Avez-vous des dents cariées visibles?", ["Oui, plusieurs", "Oui, une", "Non", "Je ne sais pas"]),
        q("single_choice", "Avez-vous déjà consulté un dentiste?", ["Oui, <1 an", "Oui, >1 an", "Jamais"]),
        q("single_choice", "Pourquoi vous n'avez pas consulté?", ["Pas de dentiste proche", "Trop cher", "Peur", "Pas nécessaire", "N/A - j'ai consulté"]),
        q("multi_choice", "Habitudes alimentaires sucrées?", ["Boissons sucrées quotidiennes", "Bonbons/sucettes fréquents", "Peu de sucre", "Aucun"]),
        q("single_choice", "Avez-vous perdu des dents?", ["Oui, plusieurs", "Oui, une", "Non"]),
        q("rating", "Comment évaluez-vous votre santé dentaire? (1=très mauvaise, 5=excellente)"),
        q("long_text", "Avez-vous des questions pour le dentiste?", undefined, false),
      ]
    })
  },
  {
    id: "maternal_health",
    title: "Santé Maternelle / Maternal Health",
    description: "Suivi de grossesse et soins maternels en communauté.",
    category: "Maternité",
    emoji: "🤱",
    build: () => ({
      title: "Enquête Santé Maternelle",
      description: "Évaluation de l'accès aux soins maternels et prénataux dans la communauté.",
      surveyType: "maternal",
      questions: [
        q("short_text", "Village / Quartier"),
        q("short_text", "Âge de la mère"),
        q("single_choice", "Statut actuel", ["Enceinte / Pregnant", "Accouchée <6 mois / Delivered <6 months", "Accouchée >6 mois"]),
        q("short_text", "Nombre de grossesses antérieures (inclus actuelle)"),
        q("single_choice", "Avez-vous fait des consultations prénatales (CPN)?", ["Oui, toutes", "Oui, quelques-unes", "Non"]),
        q("single_choice", "Combien de CPN au total?", ["0", "1-3", "4 ou plus"]),
        q("single_choice", "Où avez-vous accouché / comptez accoucher?", ["Hôpital/clinique", "Centre de santé", "À domicile avec sage-femme", "À domicile seule/famille", "Pas encore décidé"]),
        q("single_choice", "Avez-vous reçu les vaccins de grossesse (VAT)?", ["Oui, complets", "Oui, partiels", "Non", "Je ne sais pas"]),
        q("single_choice", "Prenez-vous des suppléments (fer, acide folique)?", ["Oui, régulièrement", "Parfois", "Non"]),
        q("single_choice", "Avez-vous été testée pour le VIH pendant cette grossesse?", ["Oui", "Non", "Préfère ne pas répondre"]),
        q("single_choice", "Distance à la maternité la plus proche?", ["<1km", "1-5km", "5-15km", ">15km"]),
        q("rating", "Qualité des soins maternels dans votre zone (1=très mauvaise, 5=excellente)"),
        q("long_text", "Difficultés rencontrées / Challenges faced", undefined, false),
      ]
    })
  },
  {
    id: "water_sanitation",
    title: "Eau & Assainissement / Water & Sanitation",
    description: "Évaluation WASH — eau, hygiène et assainissement communautaire.",
    category: "Santé Environnementale",
    emoji: "💧",
    build: () => ({
      title: "Enquête Eau et Assainissement (WASH)",
      description: "Évaluation de l'accès à l'eau potable et de l'assainissement dans la communauté.",
      surveyType: "wash",
      questions: [
        q("short_text", "Village / Quartier"),
        q("short_text", "Nombre de personnes dans le ménage"),
        q("single_choice", "Source d'eau principale", ["Robinet dans la maison", "Borne fontaine", "Puits protégé", "Puits non protégé", "Rivière/lac", "Eau de pluie", "Camion citerne"]),
        q("single_choice", "Temps pour accéder à l'eau?", ["<5 minutes", "5-30 minutes", "30min-1h", ">1 heure"]),
        q("single_choice", "Traitez-vous l'eau avant de boire?", ["Oui, toujours", "Parfois", "Non"]),
        q("multi_choice", "Méthode de traitement de l'eau?", ["Ébullition", "Chloration", "Filtre", "Aucune", "Autre"]),
        q("single_choice", "Type de toilettes / latrines?", ["WC avec chasse", "Latrine couverte", "Latrine ouverte", "Défécation en plein air"]),
        q("single_choice", "Lavage des mains après les toilettes?", ["Toujours avec savon", "Toujours avec eau seulement", "Parfois", "Jamais"]),
        q("single_choice", "Avez-vous du savon à la maison?", ["Oui, toujours", "Parfois", "Non"]),
        q("single_choice", "Y a-t-il des cas de diarrhée dans le ménage ce mois?", ["Oui, enfant <5ans", "Oui, adulte", "Oui, les deux", "Non"]),
        q("rating", "Satisfaction envers l'accès à l'eau dans votre zone (1=très mauvaise, 5=excellente)"),
      ]
    })
  },
  {
    id: "nutrition_child",
    title: "Nutrition Infantile / Child Nutrition",
    description: "Évaluation de l'état nutritionnel des enfants de moins de 5 ans.",
    category: "Nutrition",
    emoji: "🥗",
    build: () => ({
      title: "Enquête Nutrition Infantile (0-5 ans)",
      description: "Évaluation de l'état nutritionnel et des pratiques alimentaires des enfants.",
      surveyType: "nutrition",
      questions: [
        q("short_text", "Village / Quartier"),
        q("single_choice", "Sexe de l'enfant", ["Masculin", "Féminin"]),
        q("short_text", "Âge de l'enfant (mois)"),
        q("short_text", "Poids de l'enfant (kg) si disponible", undefined, false),
        q("short_text", "Taille de l'enfant (cm) si disponible", undefined, false),
        q("single_choice", "L'enfant a-t-il des signes de malnutrition?", ["Oui, sévère (œdèmes)", "Oui, modérée (maigreur visible)", "Non"]),
        q("single_choice", "Allaitement maternel?", ["Oui, exclusif <6 mois", "Oui, mixte", "Non, sevré", "Jamais allaité"]),
        q("single_choice", "Fréquence des repas par jour?", ["1 fois", "2 fois", "3 fois ou plus"]),
        q("multi_choice", "Aliments consommés hier?", ["Céréales (mil, maïs, riz)", "Légumineuses (haricots, arachides)", "Légumes verts", "Fruits", "Viande/poisson/œuf", "Produits laitiers", "Aliments sucrés", "Huile/graisses"]),
        q("single_choice", "L'enfant a-t-il reçu de la vitamine A ces 6 mois?", ["Oui", "Non", "Je ne sais pas"]),
        q("single_choice", "L'enfant a-t-il été déparasité ces 6 mois?", ["Oui", "Non", "Je ne sais pas"]),
        q("rating", "Sécurité alimentaire du ménage (1=insécurité sévère, 5=sécurité totale)"),
      ]
    })
  },
];

export function getTemplateById(id: string) {
  return SURVEY_TEMPLATES.find(t => t.id === id);
}
