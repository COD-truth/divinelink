export type Lang = "en" | "fr";

const translations: Record<string, Record<Lang, string>> = {
  // Auth
  "auth.title": { en: "DivineLink", fr: "DivineLink" },
  "auth.subtitle": { en: "Medical Clinic Management", fr: "Gestion de Cabinet Médical" },
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
  "patient.confirmDelete": { en: "Delete Patient?", fr: "Supprimer le patient ?" },
  "patient.deleteWarning": { en: "This will permanently delete this patient and all related consultations, appointments and documents.", fr: "Cela supprimera définitivement ce patient et toutes ses consultations, rendez-vous et documents." },
  
  // Appointments
  "apt.create": { en: "New Appointment", fr: "Nouveau rendez-vous" },
  "apt.edit": { en: "Edit Appointment", fr: "Modifier le rendez-vous" },
  "apt.patient": { en: "Patient", fr: "Patient" },
  "apt.doctor": { en: "Doctor", fr: "Médecin" },
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
  "consult.edit": { en: "Edit Consultation", fr: "Modifier la consultation" },
  "consult.updated": { en: "Consultation updated (new version)", fr: "Consultation modifiée (nouvelle version)" },
  "consult.symptoms": { en: "Symptoms", fr: "Symptômes" },
  "consult.diagnosis": { en: "Diagnosis", fr: "Diagnostic" },
  "consult.treatment": { en: "Treatment Plan", fr: "Plan de traitement" },
  "consult.prescription": { en: "Prescription", fr: "Ordonnance" },
  "consult.print": { en: "Print Prescription", fr: "Imprimer l'ordonnance" },
  
  "consult.notes": { en: "Notes", fr: "Notes" },
  "consult.confirmDelete": { en: "Delete Consultation?", fr: "Supprimer la consultation ?" },
  "consult.deleteWarning": { en: "This will delete this consultation and all its versions.", fr: "Cela supprimera cette consultation et toutes ses versions." },
  "consult.history": { en: "Version History", fr: "Historique des versions" },
  "consult.currentVersion": { en: "Current version", fr: "Version actuelle" },
  "consult.olderVersion": { en: "Previous version", fr: "Version précédente" },
  "consult.modified": { en: "Modified", fr: "Modifiée" },
  "consult.version": { en: "Version", fr: "Version" },
  "consult.editedBy": { en: "Edited by", fr: "Modifié par" },
  "consult.viewVersions": { en: "View versions", fr: "Voir les versions" },
  "consult.original": { en: "Original", fr: "Original" },
  "consult.revision": { en: "Revision", fr: "Révision" },
  
  
  // Documents
  "doc.upload": { en: "Upload Image", fr: "Téléverser une image" },
  "doc.uploadFile": { en: "Upload File", fr: "Téléverser un fichier" },
  "doc.maxSize": { en: "Max 5MB per file", fr: "Max 5 Mo par fichier" },
  "doc.noFiles": { en: "No documents uploaded", fr: "Aucun document téléversé" },
  "doc.delete": { en: "Delete", fr: "Supprimer" },
  "doc.tag": { en: "Tag", fr: "Étiquette" },
  "doc.tag.lab": { en: "Lab result", fr: "Résultat de labo" },
  "doc.tag.referral": { en: "Referral", fr: "Référence" },
  "doc.tag.xray": { en: "X-ray", fr: "Radiographie" },
  "doc.tag.other": { en: "Other", fr: "Autre" },
  "doc.search": { en: "Search documents...", fr: "Rechercher des documents..." },
  "doc.allTags": { en: "All tags", fr: "Toutes les étiquettes" },
  "doc.caption": { en: "Caption", fr: "Légende" },
  "doc.images": { en: "Images", fr: "Images" },
  "doc.addImages": { en: "Add images", fr: "Ajouter des images" },
  "doc.profilePhoto": { en: "Profile photo", fr: "Photo de profil" },
  "doc.changePhoto": { en: "Change photo", fr: "Changer la photo" },
  "doc.removePhoto": { en: "Remove photo", fr: "Supprimer la photo" },

  // Global search
  "search.global": { en: "Search patients, notes, documents...", fr: "Rechercher patients, notes, documents..." },
  "search.patients": { en: "Patients", fr: "Patients" },
  "search.consultations": { en: "Consultations", fr: "Consultations" },
  "search.documents": { en: "Documents", fr: "Documents" },
  "search.noResults": { en: "No results", fr: "Aucun résultat" },

  // Storage
  "storage.title": { en: "Storage usage", fr: "Utilisation du stockage" },
  "storage.used": { en: "Used", fr: "Utilisé" },
  "storage.of": { en: "of", fr: "sur" },
  "storage.warning": { en: "Storage is over 70% full. Consider exporting and clearing old data.", fr: "Le stockage est rempli à plus de 70%. Pensez à exporter et nettoyer les anciennes données." },
  
  // Users
  "user.add": { en: "Add Staff", fr: "Ajouter du personnel" },
  "user.name": { en: "Full Name", fr: "Nom complet" },
  "user.role": { en: "Role", fr: "Rôle" },
  "user.pin": { en: "PIN (4-6 digits)", fr: "PIN (4-6 chiffres)" },
  "user.admin": { en: "Admin", fr: "Administrateur" },
  "user.doctor": { en: "Doctor", fr: "Médecin" },
  "user.receptionist": { en: "Receptionist", fr: "Réceptionniste" },
  "user.phone": { en: "Phone / WhatsApp", fr: "Téléphone / WhatsApp" },
  "user.phoneHint": { en: "for reminders", fr: "pour les rappels" },
  
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
  
  // Role
  "role.admin": { en: "Admin", fr: "Administrateur" },
  "role.doctor": { en: "Doctor", fr: "Médecin" },
  "role.receptionist": { en: "Receptionist", fr: "Réceptionniste" },
  "role.loggedInAs": { en: "Logged in as", fr: "Connecté en tant que" },
  "role.switchUser": { en: "Switch user", fr: "Changer d'utilisateur" },

  // WhatsApp
  "wa.remind": { en: "WhatsApp reminder", fr: "Rappel WhatsApp" },
  "wa.patient": { en: "Send to patient", fr: "Envoyer au patient" },
  "wa.doctor": { en: "Send to doctor", fr: "Envoyer au médecin" },
  "wa.noPhone": { en: "No phone number on file", fr: "Aucun numéro de téléphone" },
  "wa.message": { en: "Reminder: appointment on {date} at {time} with Dr. {doctor}. Reason: {reason}.", fr: "Rappel : rendez-vous le {date} à {time} avec Dr. {doctor}. Motif : {reason}." },

  // Reminders panel
  "reminder.title": { en: "Appointment reminders", fr: "Rappels de rendez-vous" },
  "reminder.subtitle": { en: "Configure WhatsApp/SMS templates and preview them offline.", fr: "Configurez les modèles WhatsApp/SMS et prévisualisez-les hors ligne." },
  "reminder.template": { en: "Message template", fr: "Modèle de message" },
  "reminder.placeholders": { en: "Available placeholders", fr: "Variables disponibles" },
  "reminder.channel": { en: "Channel", fr: "Canal" },
  "reminder.preview": { en: "Preview", fr: "Aperçu" },
  "reminder.send": { en: "Open & send", fr: "Ouvrir et envoyer" },
  "reminder.copy": { en: "Copy", fr: "Copier" },
  "reminder.copied": { en: "Message copied", fr: "Message copié" },
  "reminder.copyFail": { en: "Could not copy", fr: "Impossible de copier" },
  "reminder.reset": { en: "Reset defaults", fr: "Réinitialiser" },
  "reminder.online": { en: "Online", fr: "En ligne" },
  "reminder.offline": { en: "Offline preview", fr: "Aperçu hors ligne" },
  "reminder.offlineHint": { en: "You're offline — message can be previewed and copied; sending opens when back online.", fr: "Vous êtes hors ligne — le message peut être prévisualisé et copié ; l'envoi s'ouvrira une fois reconnecté." },
  "reminder.chars": { en: "chars", fr: "car." },
  "reminder.open": { en: "Reminders", fr: "Rappels" },

  // Patient docs at registration
  "patient.attachments": { en: "Attachments (optional)", fr: "Pièces jointes (optionnel)" },
  "patient.attachFiles": { en: "Attach files", fr: "Joindre des fichiers" },

  // Install
  "install.hint": { en: "Tip: Install this app on your phone via your browser menu → 'Add to Home Screen' for offline use.", fr: "Astuce : Installez cette app sur votre téléphone via le menu du navigateur → 'Ajouter à l'écran d'accueil' pour une utilisation hors ligne." },

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
