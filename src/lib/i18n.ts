export type Lang = "en" | "fr";

const translations: Record<string, Record<Lang, string>> = {
  // Auth
  "auth.title": { en: "DentaCare EMR", fr: "DentaCare DME" },
  "auth.subtitle": { en: "Dental Clinic Management", fr: "Gestion de Cabinet Dentaire" },
  "auth.pin": { en: "Enter your PIN", fr: "Entrez votre PIN" },
  "auth.login": { en: "Login", fr: "Connexion" },
  "auth.error": { en: "Invalid PIN", fr: "PIN invalide" },
  "auth.logout": { en: "Logout", fr: "Déconnexion" },
  
  // Nav
  "nav.dashboard": { en: "Dashboard", fr: "Tableau de bord" },
  "nav.patients": { en: "Patients", fr: "Patients" },
  "nav.appointments": { en: "Appointments", fr: "Rendez-vous" },
  "nav.consultations": { en: "Consultations", fr: "Consultations" },
  "nav.documents": { en: "Documents", fr: "Documents" },
  "nav.users": { en: "User Management", fr: "Gestion des utilisateurs" },
  "nav.backup": { en: "Backup & Restore", fr: "Sauvegarde et restauration" },
  "nav.settings": { en: "Settings", fr: "Paramètres" },
  
  // Patients
  "patient.register": { en: "Register Patient", fr: "Inscrire un patient" },
  "patient.search": { en: "Search patients...", fr: "Rechercher des patients..." },
  "patient.firstName": { en: "First Name", fr: "Prénom" },
  "patient.lastName": { en: "Last Name", fr: "Nom" },
  "patient.phone": { en: "Phone", fr: "Téléphone" },
  "patient.dob": { en: "Date of Birth", fr: "Date de naissance" },
  "patient.address": { en: "Address", fr: "Adresse" },
  "patient.alerts": { en: "Medical Alerts", fr: "Alertes médicales" },
  "patient.id": { en: "Patient ID", fr: "ID Patient" },
  "patient.edit": { en: "Edit Patient", fr: "Modifier le patient" },
  "patient.details": { en: "Patient Details", fr: "Détails du patient" },
  "patient.noResults": { en: "No patients found", fr: "Aucun patient trouvé" },
  
  // Appointments
  "apt.create": { en: "New Appointment", fr: "Nouveau rendez-vous" },
  "apt.edit": { en: "Edit Appointment", fr: "Modifier le rendez-vous" },
  "apt.patient": { en: "Patient", fr: "Patient" },
  "apt.dentist": { en: "Dentist", fr: "Dentiste" },
  "apt.date": { en: "Date", fr: "Date" },
  "apt.time": { en: "Time", fr: "Heure" },
  "apt.reason": { en: "Reason", fr: "Motif" },
  "apt.status": { en: "Status", fr: "Statut" },
  "apt.scheduled": { en: "Scheduled", fr: "Planifié" },
  "apt.completed": { en: "Completed", fr: "Terminé" },
  "apt.cancelled": { en: "Cancelled", fr: "Annulé" },
  "apt.noshow": { en: "No Show", fr: "Absent" },
  "apt.today": { en: "Today", fr: "Aujourd'hui" },
  
  // Consultations
  "consult.new": { en: "New Consultation", fr: "Nouvelle consultation" },
  "consult.symptoms": { en: "Symptoms", fr: "Symptômes" },
  "consult.diagnosis": { en: "Diagnosis", fr: "Diagnostic" },
  "consult.treatment": { en: "Treatment Plan", fr: "Plan de traitement" },
  "consult.prescription": { en: "Prescription", fr: "Ordonnance" },
  "consult.print": { en: "Print Prescription", fr: "Imprimer l'ordonnance" },
  "consult.toothChart": { en: "Tooth Chart", fr: "Schéma dentaire" },
  "consult.notes": { en: "Notes", fr: "Notes" },
  
  // Tooth conditions
  "tooth.healthy": { en: "Healthy", fr: "Sain" },
  "tooth.caries": { en: "Caries", fr: "Carie" },
  "tooth.filled": { en: "Filled", fr: "Obturé" },
  "tooth.extracted": { en: "Extracted", fr: "Extrait" },
  "tooth.crown": { en: "Crown", fr: "Couronne" },
  
  // Documents
  "doc.upload": { en: "Upload Image", fr: "Téléverser une image" },
  "doc.maxSize": { en: "Max 5MB per file", fr: "Max 5 Mo par fichier" },
  "doc.noFiles": { en: "No documents uploaded", fr: "Aucun document téléversé" },
  "doc.delete": { en: "Delete", fr: "Supprimer" },
  
  // Users
  "user.add": { en: "Add Staff", fr: "Ajouter du personnel" },
  "user.name": { en: "Full Name", fr: "Nom complet" },
  "user.role": { en: "Role", fr: "Rôle" },
  "user.pin": { en: "PIN (4-6 digits)", fr: "PIN (4-6 chiffres)" },
  "user.admin": { en: "Admin", fr: "Administrateur" },
  "user.dentist": { en: "Dentist", fr: "Dentiste" },
  "user.receptionist": { en: "Receptionist", fr: "Réceptionniste" },
  
  // Backup
  "backup.export": { en: "Export Data", fr: "Exporter les données" },
  "backup.import": { en: "Import Data", fr: "Importer les données" },
  "backup.password": { en: "Encryption Password", fr: "Mot de passe de chiffrement" },
  "backup.confirm": { en: "Confirm Password", fr: "Confirmer le mot de passe" },
  "backup.exporting": { en: "Exporting...", fr: "Exportation..." },
  "backup.importing": { en: "Importing...", fr: "Importation..." },
  "backup.success": { en: "Operation completed successfully", fr: "Opération terminée avec succès" },
  "backup.warning": { en: "This will replace all existing data!", fr: "Ceci remplacera toutes les données existantes !" },
  
  // Common
  "common.save": { en: "Save", fr: "Enregistrer" },
  "common.cancel": { en: "Cancel", fr: "Annuler" },
  "common.delete": { en: "Delete", fr: "Supprimer" },
  "common.edit": { en: "Edit", fr: "Modifier" },
  "common.add": { en: "Add", fr: "Ajouter" },
  "common.search": { en: "Search", fr: "Rechercher" },
  "common.loading": { en: "Loading...", fr: "Chargement..." },
  "common.noData": { en: "No data", fr: "Aucune donnée" },
  "common.confirm": { en: "Confirm", fr: "Confirmer" },
  "common.back": { en: "Back", fr: "Retour" },
  "common.view": { en: "View", fr: "Voir" },
  "common.actions": { en: "Actions", fr: "Actions" },
  
  // Dashboard
  "dash.welcome": { en: "Welcome", fr: "Bienvenue" },
  "dash.totalPatients": { en: "Total Patients", fr: "Total des patients" },
  "dash.todayAppts": { en: "Today's Appointments", fr: "Rendez-vous du jour" },
  "dash.thisWeek": { en: "This Week", fr: "Cette semaine" },
  "dash.recentPatients": { en: "Recent Patients", fr: "Patients récents" },
};

export function t(key: string, lang: Lang): string {
  return translations[key]?.[lang] ?? key;
}
