// ╔══════════════════════════════════════════════════════════════════════╗
// ║  🚨 RÈGLE PERMANENTE — CHANGELOG & VERSIONING                            ║
// ╠══════════════════════════════════════════════════════════════════════╣
// ║  À CHAQUEodif d'une app de JacSuite (feature / fix / polish / refonte) ║
// ║  l'agent DOIT mettre à jour ce fichier dans la même série d'edits,       ║
// ║  SANS que l'utilisateur ait à le demander :                              ║
// ║                                                                          ║
// ║    • Même sprint que la version courante                                 ║
// ║      → ajouter une ligne dans `changes` de l'entrée en tête              ║
// ║      → garder le même numéro de version                                  ║
// ║                                                                          ║
// ║    • Release distincte                                                   ║
// ║      → nouvelle entrée EN TÊTE du tableau `entries`                       ║
// ║      → bumper `version` du wrapper selon SemVer :                        ║
// ║          MAJOR : refonte UI majeure ou breaking change                   ║
// ║          MINOR : nouvelle fonctionnalité visible                         ║
// ║          PATCH : bugfix / polish / micro-amélioration                    ║
// ║                                                                          ║
// ║  Types valides : 'nouveau' | 'fix' | 'amelio' | 'refonte' | 'bientot'    ║
// ║                                                                          ║
// ║  ── 🎯 NE METTRE QUE CE QUI EST VISIBLE PAR L'UTILISATEUR ───────          ║
// ║  ✅ OUI : nouveau bouton, fix bug visible, refonte UI, perf, raccourci   ║
// ║  ❌ NON : refactor interne, README, package.json, service worker,        ║
// ║         renommages, restructuration de dossiers                          ║
// ║  Si l'utilisateur ne peut ni le voir ni le ressentir, ça n'a rien à      ║
// ║  faire dans le changelog.                                                ║
// ║                                                                          ║
// ║  ── 📐 SemVer (MAJOR.MINOR.PATCH) — arbre de décision ────────────    ║
// ║  1. Refonte UX/UI majeure ou breaking ?     → MAJOR (1.4.7 → 2.0.0)      ║
// ║  2. Nouvelle feature visible rétro-compat ? → MINOR (1.4.7 → 1.5.0)      ║
// ║  3. Sinon (bugfix / polish / micro-amélio)  → PATCH (1.4.7 → 1.4.8)      ║
// ║  Quand on bump un niveau, les niveaux inférieurs repartent à 0.          ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Source de vérité unique pour les versions et notes de version de chaque
// app de JacSuite. Chaque AproposSection lit ici (via getAppVersion) et la
// VersionModal (« Quoi de neuf ») lit l'historique complet via
// getChangelogByAppName.
//
// Convention SemVer simplifiée :
//   MAJOR : refonte UI majeure ou breaking change de structure de données
//   MINOR : nouvelle fonctionnalité visible (sync cloud, nouvelle vue…)
//   PATCH : bugfix, polish, micro-amélioration
//
// Pour bump une app :
//   1. Ajoute une entrée EN TÊTE du tableau `entries` (la 1ʳᵉ entrée est
//      automatiquement marquée « ACTUELLE » dans VersionModal)
//   2. Mets la nouvelle version dans le champ `version` du wrapper
//
// Format d'une entrée :
//   {
//     version: string,
//     date: string,                          // libre, ex. '22 mai 2026'
//     title: string,                         // titre court optionnel
//     changes: Array<{
//       type: 'nouveau' | 'fix' | 'amelio' | 'refonte' | 'bientot',
//       text: string,
//     }>,
//   }
//
// Les types correspondent aux badges CSS de VersionModal (.vm-badge-*).

export const APP_CHANGELOGS = {
	jacsuite: {
		version: '1.11.0',
		entries: [
			{
				version: '1.11.0',
				date: '1 juin 2026',
				title: 'Favoris personnalisables & alerte de mise à jour',
				changes: [
					{ type: 'nouveau', text: 'Le menu « Applications » (grille à 9 points) devient un vrai panneau de favoris façon Google : un en-tête « Vos favoris » et un bouton crayon pour passer en mode édition.' },
					{ type: 'nouveau', text: 'En mode édition, glissez-déposez vos applis pour les réordonner, retirez-en une d’un clic sur le ×, puis validez avec « Terminé » ou revenez en arrière avec « Annuler ».' },
					{ type: 'nouveau', text: 'Alerte de mise à jour : quand une nouvelle version du site est publiée, une fine bannière apparaît en haut pour vous inviter à rafraîchir et obtenir les dernières nouveautés et corrections de bugs.' },
					{ type: 'amelio', text: 'Fini le rechargement automatique surprise : la nouvelle version ne s’installe que lorsque vous cliquez sur « Rafraîchir », pour ne jamais interrompre ce que vous étiez en train de faire.' },
				],
			},
			{
				version: '1.10.0',
				date: '31 mai 2026',
				title: 'JacSuite Cloud dans le menu Applications',
				changes: [
					{ type: 'nouveau', text: 'JacSuite Cloud rejoint le menu « Applications » (grille à 9 points) des pages d’accueil de JacPDF, JacDoc, JacPaint et de JacSuite Cloud lui-même : un clic ouvre directement JacSuite Cloud, aux côtés de JacPDF, JacDoc, JacNote, JacPaint, JacTâche, JacCalendrier et Classroom.' },
				],
			},
			{
				version: '1.9.0',
				date: '31 mai 2026',
				title: 'Badge d’abonnement dans toutes les apps',
				changes: [
					{ type: 'nouveau', text: 'Un badge d’abonnement apparaît désormais à droite du nom de l’app dans toutes les apps (Gratuit, Pro ou Premium) : il remplace l’ancien badge « DEV » et indique d’un coup d’œil votre formule.' },
					{ type: 'nouveau', text: 'Un clic sur le badge ouvre la fenêtre des abonnements pour changer de formule ou gérer le vôtre.' },
					{ type: 'amelio', text: 'Le badge couvre désormais aussi JacSuite Classroom, JacCalendrier et JacSuite Cloud, à droite de leur nom.' },
				],
			},
			{
				version: '1.8.0',
				date: '31 mai 2026',
				title: 'Connexion sans mot de passe & méthode principale',
				changes: [
					{ type: 'nouveau', text: 'Nouvelle option « Connexion sans mot de passe » dans Compte → Sécurité : une fois activée (il faut au moins une passkey enregistrée), l’écran de connexion masque le champ et le bouton mot de passe et met la passkey en avant — comme l’option sans mot de passe de Google ou d’Apple.' },
					{ type: 'nouveau', text: 'Le mot de passe reste une roue de secours : un lien « Utiliser le mot de passe » sur l’écran de connexion le réaffiche à tout moment, pour ne jamais rester bloqué dehors.' },
					{ type: 'nouveau', text: 'Nouveau réglage « Moyen de connexion principal » (mot de passe ou passkey) dans Compte → Sécurité : la méthode choisie est mise en avant en premier sur l’écran de connexion.' },
					{ type: 'nouveau', text: 'Vérification en deux étapes à la connexion : si la 2FA est activée sur ton compte, JacSuite demande désormais le code à 6 chiffres de ton application d’authentification juste après le mot de passe.' },
					{ type: 'fix', text: 'Connexion sans compte : un invité repart toujours au palier Gratuit et n’hérite plus par erreur d’un statut premium laissé par une session précédente sur le même appareil.' },
				],
			},
			{
				version: '1.7.0',
				date: '31 mai 2026',
				title: 'Protection anti-robots à la connexion (CAPTCHA)',
				changes: [
					{ type: 'nouveau', text: 'Protection anti-robots sur l’écran de connexion : une vérification de sécurité Cloudflare (CAPTCHA) s’affiche désormais avant la connexion, l’inscription, la réinitialisation de mot de passe et l’accès sans compte, pour bloquer les robots et les attaques automatisées.' },
					{ type: 'amelio', text: 'La plupart du temps la vérification est invisible et passe toute seule — vous n’avez rien à faire de plus pour vous connecter.' },
					{ type: 'fix', text: 'Accès aux paramètres de sécurité et réinitialisation du mot de passe depuis le compte : la vérification anti-robots y est désormais intégrée. Avant ce correctif, une fois le CAPTCHA activé, ces actions échouaient avec un faux message « mot de passe incorrect ».' },
					{ type: 'nouveau', text: 'Connexion par passkey depuis l’écran de connexion : un bouton « Se connecter avec une passkey » vous identifie sans mot de passe avec Face ID, Touch ID, Windows Hello ou une clé de sécurité (la passkey doit d’abord avoir été ajoutée dans Compte → Sécurité).' },
					{ type: 'fix', text: 'Message d’erreur plus clair à la connexion quand la vérification anti-robot échoue : au lieu d’un texte technique en anglais, JacSuite indique qu’il s’agit du CAPTCHA et quoi vérifier.' },
					{ type: 'fix', text: 'Connexion par passkey compatible avec la protection anti-robots : la vérification de sécurité est désormais transmise lors de la connexion par passkey, qui échouait sinon une fois le CAPTCHA activé.' },
				],
			},
			{
				version: '1.6.0',
				date: '30 mai 2026',
				title: 'Section Sécurité — mot de passe, email, 2FA & passkeys',
				changes: [
					{ type: 'nouveau', text: 'Nouvelle section « Sécurité » dans les réglages JacSuite : changez votre mot de passe directement dans l’app (vérification du mot de passe actuel, sans passer par un email de réinitialisation).' },
					{ type: 'nouveau', text: 'Double authentification (2FA) : activez un code à usage unique via une app comme Google Authenticator, Authy ou 1Password — scannez le QR code, entrez le code à 6 chiffres pour confirmer, et désactivez-la quand vous voulez.' },
					{ type: 'nouveau', text: 'Changement d’adresse email directement depuis la section Sécurité (avec email de confirmation).' },
					{ type: 'nouveau', text: 'Passkeys (bêta) : connectez-vous sans mot de passe avec Face ID, Touch ID, Windows Hello ou une clé de sécurité. Ajoutez et gérez vos passkeys dans Compte → Sécurité.' },
				],
			},
			{
				version: '1.5.0',
				date: '30 mai 2026',
				title: 'JacSuite Cloud unifié — un seul cloud, des dossiers partagés',
				changes: [
					{ type: 'nouveau', text: 'JacSuite Cloud devient le cloud central de toute la suite : une seule vue rassemble les fichiers de toutes les apps (PDF, toiles, documents), façon Google Drive.' },
					{ type: 'nouveau', text: 'Navigation par dossiers dans JacSuite Cloud : entrez dans vos dossiers, suivez le fil d’Ariane et glissez-déposez fichiers et dossiers pour les ranger. Recherche, tri et aperçu rapide inclus, dans une vue unique qui mélange PDF, toiles et documents — exactement comme Google Drive.' },
					{ type: 'nouveau', text: 'Dossiers partagés entre toutes les apps : les dossiers que vous créez sont les mêmes partout — le cloud d’une app est un miroir filtré du cloud central, comme Google Drive et Docs.' },
					{ type: 'amelio', text: 'Un navigateur cloud unique réutilisé partout (fil d’Ariane, dossiers, renommer / supprimer / déplacer / téléverser / télécharger) pour une expérience identique d’une app à l’autre.' },
				],
			},
			{
				version: '1.4.0',
				date: '30 mai 2026',
				title: 'Trois formules : Gratuit, Pro, Premium',
				changes: [
					{ type: 'nouveau', text: 'Trois formules d’abonnement présentées côte à côte dans la fenêtre Premium : Gratuit, Pro et Premium, chacune avec ses fonctionnalités et votre plan actuel mis en évidence.' },
					{ type: 'nouveau', text: 'Nouveau bouton « Mise à niveau » (ou « Gérer mon abonnement » si vous êtes déjà abonné) dans les Réglages rapides : un clic ouvre la fenêtre des abonnements.' },
					{ type: 'amelio', text: 'Le plan Pro débloque la barre latérale d’apps et le Spotlight avancé ; le plan Premium ajoute JacPaint pro — chaque fonctionnalité réservée indique désormais le palier requis.' },
				],
			},
			{
				version: '1.3.0',
				date: '30 mai 2026',
				title: 'JacSuite Premium — débloquez les outils pro',
				changes: [
					{ type: 'nouveau', text: 'JacSuite Premium : un nouvel abonnement qui débloque les fonctionnalités pro de la suite, accessible depuis la fenêtre Premium.' },
					{ type: 'nouveau', text: 'Demande premium avec validation : cliquez « Demander premium » pour envoyer une demande à l’administrateur. Il la reçoit dans ses notifications avec des boutons Accepter / Refuser, et dès qu’elle est acceptée vous recevez une notification et tout se débloque.' },
					{ type: 'nouveau', text: 'Fenêtre Premium élégante, accessible depuis n’importe quelle app : elle liste les avantages et les fonctionnalités réservées, regroupées par app, et met en avant celle que vous venez d’essayer.' },
					{ type: 'nouveau', text: 'Cadenas « Premium » sur les fonctionnalités réservées : un clic ouvre la fenêtre Premium pour découvrir l’offre, sans bloquer le reste de l’app.' },
					{ type: 'nouveau', text: 'Réservé au premium — Barre latérale d’apps : le rail latéral et son bouton dans la barre d’onglets ne s’activent que pour les abonnés.' },
					{ type: 'nouveau', text: 'Réservé au premium — Spotlight avancé : calcul instantané, météo, historique du presse-papier et barre de catégories. La recherche d’apps, de fichiers et les actions restent gratuites.' },
					{ type: 'nouveau', text: 'Réservé au premium — JacPaint pro : filtres et calques d’ajustement, groupes de calques, modes de fusion et masques alpha.' },
				],
			},
			{
				version: '1.2.0',
				date: '29 mai 2026',
				title: 'Barre latérale d’apps style Microsoft Edge',
				changes: [
					{ type: 'nouveau', text: 'Barre latérale d’apps style Microsoft Edge : un rail fixe à droite ; clique une app pour ouvrir un panneau ancré pleine hauteur, redimensionnable, épinglable (pousse le contenu) ou en overlay, masquable d’un clic via un bouton dans la barre d’onglets (JacPDF, JacDoc, JacPaint, JacNote, JacTâche, JacCalendrier, Classroom)' },
					{ type: 'nouveau', text: 'Barre latérale entièrement configurable (Réglages › Général) : côté gauche/droite, largeur du panneau, taille des icônes, libellés sous les icônes, apps visibles et leur ordre (glisser-déposer ou ▲▼), ouverture épinglée par défaut, fermeture au clic extérieur, mémoire de la dernière app ouverte, bouton + pour réafficher une app, et raccourci d’affichage/masquage' },
					{ type: 'nouveau', text: 'Aperçu au survol : passe la souris sur JacTâche ou JacCalendrier dans le rail pour voir tes prochaines tâches et événements sans ouvrir l’app (activable dans Réglages › Général)' },
					{ type: 'nouveau', text: 'Réglages › Général : interrupteur « Activer la barre latérale » pour la désactiver complètement — le rail et son bouton dans la barre d’onglets disparaissent d’un coup (désactivée par défaut)' },
					{ type: 'amelio', text: 'Panneau Réglages rapides redessiné au style de la modale Paramètres complète, avec un menu déroulant custom pour la langue (au lieu du menu natif du navigateur)' },
					{ type: 'amelio', text: 'Couleur d’accent unifiée et automatique : le sélecteur de couleur d’accent a été retiré des Réglages ; chaque app affiche désormais la couleur de son logo (vert JacSuite partout, mauve pour JacPaint), appliquée automatiquement à toute l’interface partagée selon l’app active' },
					{ type: 'amelio', text: 'Menus déroulants uniformisés dans toute la suite : les derniers menus natifs du navigateur (filtre des fichiers récents JacPDF, expiration des liens de partage JacPaint) adoptent le menu déroulant custom JacSuite' },
					{ type: 'amelio', text: 'Début d’une phase de stabilisation et d’harmonisation : cohérence visuelle renforcée des fenêtres, menus et accents dans toutes les apps de JacSuite' },
				],
			},
			{
				version: '1.1.0',
				date: '29 mai 2026',
				title: 'Spotlight JacSuite — recherche universelle',
				changes: [
					{ type: 'nouveau', text: 'Spotlight JacSuite : une barre de recherche universelle qui s’ouvre au raccourci Cmd/Ctrl + Espace depuis n’importe quelle app, pour lancer une app en quelques touches' },
					{ type: 'nouveau', text: 'Navigation 100 % clavier dans le Spotlight : flèches ↑ ↓ pour parcourir, Entrée pour ouvrir, Échap pour fermer' },
					{ type: 'nouveau', text: 'Paramètres JacSuite › Général : le raccourci du Spotlight est désormais configurable (⌘/Ctrl + Espace, K, /, ou avec Maj)' },
					{ type: 'nouveau', text: 'Le Spotlight trouve aussi tes fichiers récents (PDF, JacCloud, JacDoc) et les ouvre en un clic' },
					{ type: 'nouveau', text: 'Actions rapides dans le Spotlight : nouveau document JacDoc, importer, ou ouvrir depuis JacCloud / Google Drive' },
					{ type: 'nouveau', text: 'Calcul instantané dans le Spotlight : tape une opération (ex. 1280*0.15) et le résultat s’affiche — Entrée pour le copier' },
					{ type: 'nouveau', text: 'Météo dans le Spotlight : tape « météo <ville> » pour la température et les conditions actuelles' },
					{ type: 'nouveau', text: 'Barre de catégories façon Spotlight Apple : bouge la souris dans le Spotlight pour faire apparaître Applications, Fichiers, Actions et Presse-papier, et filtre les résultats par catégorie en un clic' },
					{ type: 'nouveau', text: 'Historique du presse-papier : le Spotlight garde tes dernières copies (catégorie Presse-papier) — Entrée pour recopier une entrée' },
					{ type: 'amelio', text: 'Barre de catégories animée : apparition en cascade des boutons, léger zoom + ombre au survol, et petit pop à la sélection' },
					{ type: 'amelio', text: 'Boutons de catégories repositionnés en ronds à droite de la barre de recherche, comme le Spotlight d’Apple' },
					{ type: 'amelio', text: 'Spotlight épuré : raccourcis clavier masqués, et la barre rétrécit en douceur quand les ronds apparaissent (comme Apple)' },
					{ type: 'amelio', text: 'Ronds de catégories : emojis remplacés par de vraies icônes (trait fin, façon Apple)' },
					{ type: 'amelio', text: 'Choisir une catégorie fait disparaître les ronds et affiche un jeton de filtre (avec × pour le retirer) dans la barre, comme Apple' },
					{ type: 'nouveau', text: 'Bouton « ••• » à droite de la barre dans une catégorie : Applications et Fichiers basculent entre vue liste et vue grille, et le Presse-papier permet de tout effacer — comme Apple' },
					{ type: 'amelio', text: 'Survoler un rond de catégorie affiche son nom dans la barre de recherche, comme Apple' },
					{ type: 'amelio', text: 'Les résultats « Applications » affichent les vrais logos des apps au lieu des emojis' },
					{ type: 'amelio', text: 'Les fichiers et actions affichent aussi leurs vrais logos : JacCloud, Google Drive, JacPDF et JacDoc' },
					{ type: 'amelio', text: 'Les dernières icônes emoji du Spotlight (nouveau, importer, calcul, météo, presse-papier) deviennent des pictogrammes nets' },
					{ type: 'nouveau', text: 'Sous-catégories sous la barre : Applications filtrables par usage (Bureautique, Créatif, Éducation) et Fichiers par type et source (PDF, Documents, JacCloud, Drive, Local) — comme Apple' },
					{ type: 'amelio', text: 'Le raccourci ouvre le Spotlight immédiatement : maintenir la touche ne spamme plus (auto-répétition ignorée), mais appuyer plusieurs fois fonctionne — comme Apple' },
					{ type: 'amelio', text: 'Petite animation d’ouverture de la barre (apparition en ressort + fondu), comme Apple' },
					{ type: 'nouveau', text: 'Raccourci du Spotlight 100 % personnalisable : presse directement tes touches dans Réglages › Général (en plus des préréglages)' },
				],
			},
			{
				version: '1.0.0',
				date: '22 mai 2026',
				title: 'Premier release stable',
				changes: [
					{ type: 'nouveau', text: 'Modal Paramètres unifié pour toutes les apps de la suite' },
					{ type: 'nouveau', text: 'Authentification Supabase et profil utilisateur' },
					{ type: 'nouveau', text: 'Connecteurs Drive et cloud par utilisateur' },
					{ type: 'nouveau', text: 'Système central de versionning et notes de version' },
					{ type: 'fix', text: 'Launcher : badge Alpha retiré de JacNote (l’app sort de l’alpha en v1.0)' },
					{ type: 'fix', text: 'JacNote : ouverture multi-onglets cohérente avec JacTâche/JacCalendrier (plus de saut vers un autre onglet)' },
				],
			},
			{
				version: 'v.2', date: '13 mai 2026',
				changes: [
					{ type: 'refonte', text: 'JacSuite v.2 — nouveau launcher unifié avec onglets partagés entre toutes les apps' },
					{ type: 'nouveau', text: 'Shell multi-apps avec onglets, groupes colorés, drag-to-reorder et bouton + intelligent' },
					{ type: 'nouveau', text: 'Accueils dédiés pour JacPDF, JacDoc et JacNote' },
					{ type: 'nouveau', text: 'Apps en préparation au launcher : JacSlide, JacPaint, JacTâche, JacCalendrier' },
					{ type: 'nouveau', text: 'Section JacSuite dans la modale Paramètres' },
					{ type: 'amelio', text: 'JacNote passe en Alpha (badge orange) dans le launcher' },
					{ type: 'amelio', text: 'Flux d’activité des amis et fichiers récents sur l’écran du launcher' },
				],
			},
			{
				version: 'v.1', date: '4 mars 2026',
				changes: [
					{ type: 'refonte', text: 'Première mouture de JacSuite — launcher initial regroupant JacPDF, JacDoc et JacNote' },
				],
			},
		],
	},

	jaccloud: {
		version: '1.4.0',
		entries: [
			{
				version: '1.4.0',
				date: '30 mai 2026',
				title: 'Paramètres de JacSuite Cloud',
				changes: [
					{ type: 'nouveau', text: 'JacSuite Cloud a enfin ses propres réglages : ouvrez les Paramètres et choisissez « JacSuite Cloud » dans le sélecteur d’apps pour tout configurer.' },
					{ type: 'nouveau', text: 'Général : vue affichée à l’ouverture, action au clic sur un fichier (ouvrir, aperçu ou télécharger), confirmation avant suppression et vidage automatique de la corbeille.' },
					{ type: 'nouveau', text: 'Apparence : vue liste ou grille, densité des lignes, colonnes visibles (App, Type, Date, Taille), tri par défaut et format des dates (absolu ou relatif).' },
					{ type: 'nouveau', text: 'Sources & apps : choisissez quelles apps apparaissent dans le cloud central, la destination des fichiers téléversés et l’autorisation de téléchargement.' },
					{ type: 'nouveau', text: 'Cloud & sauvegarde : fréquence de synchronisation, resynchro au retour sur l’app, notifications de sync, jauge de stockage par formule et comportement quand le stockage est plein.' },
					{ type: 'nouveau', text: 'Avancé : resynchroniser, vider le cache, exporter la liste de vos fichiers en CSV, et une zone de danger pour tout supprimer.' },
				],
			},
			{
				version: '1.3.0',
				date: '30 mai 2026',
				title: 'Corbeille fonctionnelle',
				changes: [
					{ type: 'nouveau', text: 'Corbeille façon Google Drive : « Supprimer » un fichier le déplace désormais vers la corbeille au lieu de l’effacer — un message clair le rappelle et vos fichiers restent récupérables.' },
					{ type: 'nouveau', text: 'Nouvelle vue Corbeille dans la barre latérale (elle n’est plus grisée) : elle liste tous vos fichiers supprimés, toutes apps confondues, avec leur date de mise en corbeille.' },
					{ type: 'nouveau', text: 'Restaurer en un clic : chaque fichier de la corbeille a un bouton « Restaurer » qui le remet exactement là où il était.' },
					{ type: 'nouveau', text: 'Supprimer définitivement : effacez un fichier précis pour de bon, ou videz toute la corbeille d’un coup avec « Vider la corbeille » (confirmation demandée).' },
					{ type: 'amelio', text: 'Les fichiers en corbeille disparaissent automatiquement des vues Accueil, Mon disque, Récents, Favoris et du calcul du stockage.' },
				],
			},
			{
				version: '1.2.0',
				date: '30 mai 2026',
				title: 'Favoris — marquez vos fichiers d’une étoile',
				changes: [
					{ type: 'nouveau', text: 'Marquez n’importe quel fichier d’une étoile, d’un clic, depuis la liste ou le menu « … ».' },
					{ type: 'nouveau', text: 'Section « Marqués d’une étoile » fonctionnelle dans la barre latérale : retrouvez d’un coup tous vos fichiers favoris, toutes apps confondues.' },
					{ type: 'amelio', text: 'L’étoile apparaît au survol d’une ligne et reste affichée pour les fichiers déjà en favori.' },
				],
			},
			{
				version: '1.1.0',
				date: '30 mai 2026',
				title: 'Colonnes App & Date, et Récents fonctionnels',
				changes: [
					{ type: 'nouveau', text: 'Nouvelles colonnes « App » et « Date » dans la liste des fichiers : voyez d’un coup d’œil de quelle app provient chaque fichier et quand il a été modifié.' },
					{ type: 'nouveau', text: 'Section Récents fonctionnelle : vos derniers fichiers modifiés remontent automatiquement, classés par date.' },
					{ type: 'amelio', text: 'Vraie date de dernière modification suivie pour chaque fichier, et plus seulement la date de création.' },
				],
			},
			{
				version: '1.0.0',
				date: '30 mai 2026',
				title: 'JacSuite Cloud — le cloud central de toute la suite',
				changes: [
					{ type: 'nouveau', text: 'JacSuite Cloud devient le cloud central de toute la suite : une seule vue rassemble les fichiers de toutes les apps (PDF, toiles, documents), façon Google Drive.' },
					{ type: 'nouveau', text: 'Navigation par dossiers complète : entrez dans vos dossiers, suivez le fil d’Ariane et glissez-déposez fichiers et dossiers pour les ranger.' },
					{ type: 'nouveau', text: 'Recherche, tri et aperçu rapide intégrés, dans une vue unique qui mélange PDF, toiles et documents.' },
					{ type: 'nouveau', text: 'Accueil avec filtres fonctionnels : filtrez vos fichiers par app et par type en un clic.' },
					{ type: 'nouveau', text: 'Mon disque et indicateur de stockage : visualisez l’espace utilisé et la répartition de vos fichiers.' },
					{ type: 'nouveau', text: 'Menu « Nouveau » : créez un PDF, un document JacDoc ou une toile JacPaint directement depuis le cloud.' },
					{ type: 'amelio', text: 'Interface entièrement repensée façon Google Drive : vraies icônes et logos à la place des emojis, et barre latérale d’apps repliable.' },
				],
			},
		],
	},

	jacpdf: {
		version: '1.1.0',
		entries: [
			{
				version: '1.1.0',
				date: '31 mai 2026',
				title: 'Menu des pages repensé',
				changes: [
					{ type: 'refonte', text: 'Menu des pages entièrement repensé : en haut, une pilule « Page X / Y » où vous pouvez taper un numéro et appuyer sur Entrée pour sauter directement à cette page, mise en valeur par un liseré violet quand elle est active.' },
					{ type: 'nouveau', text: 'La page courante est désormais marquée par une coche dans la liste des pages.' },
					{ type: 'nouveau', text: 'Deux nouveaux raccourcis en bas du menu : « Aller à la première page » et « Aller à la dernière page ».' },
					{ type: 'changement', text: 'Le menu des pages devient un menu de navigation pur : le glisser-déposer pour réordonner les pages et la suppression de page directement depuis le menu ont été retirés.' },
					{ type: 'fix', text: 'Le saut direct vers une page éloignée fonctionne désormais sur les longs documents (ex. aller de la page 1 à la page 100) — la navigation restait bloquée auparavant.' },
					{ type: 'fix', text: 'Fini le clignotement du PDF au zoom : le rendu se fait hors-écran puis s’affiche d’un coup, sans flash blanc entre les paliers de zoom.' },
					{ type: 'fix', text: 'La page courante ne saute plus quand on zoome ou dézoome : le contenu reste centré au lieu de glisser vers une autre page.' },
					{ type: 'fix', text: 'Le numéro de page se met à jour au défilement même en étant zoomé (il restait figé quand une page dépassait la zone centrale de l’écran).' },
				],
			},
			{
				version: '1.0.0',
				date: '22 mai 2026',
				title: 'Premier release stable',
				changes: [
					{ type: 'nouveau', text: 'JacPDF sort de l’alpha — version stable 1.0' },
					{ type: 'nouveau', text: 'Annotation complète, partage cloud, export avec annotations aplaties' },
					{ type: 'nouveau', text: 'Intégration Google Drive (Picker + drive.file)' },
					{ type: 'fix', text: 'Badge de version dans « À propos » ouvre maintenant correctement les notes de version (prop onOpenVersionModal alignée sur les autres apps)' },
				],
			},
			{
				version: 'v20 alpha', date: '25 avril 2026',
				changes: [
					{ type: 'refonte', text: "L'alpha de JacPDF est maintenant disponible" },
				],
			},
			{
				version: 'v15.9.1', date: '22 mars 2026',
				changes: [
					{ type: 'fix', text: "Notes de version : animation fade + slide à l'expansion des versions précédentes" },
				],
			},
			{
				version: 'v15.9', date: '22 mars 2026',
				changes: [
					{ type: 'nouveau', text: 'Nouveau logo JacPDF — icône document verte + texte Jac blanc / PDF vert néon' },
					{ type: 'nouveau', text: "Couleur d'accent par défaut remplacée par le vert néon (#39FF14)" },
					{ type: 'fix', text: 'Logo accueil : séparé du système de traduction JS' },
					{ type: 'fix', text: 'Logo éditeur : couleurs sombres solides' },
					{ type: 'fix', text: 'Barre de scroll : couleur gris neutre' },
				],
			},
			{
				version: 'v15.8.5', date: '11 mars 2026',
				changes: [
					{ type: 'fix', text: "Suppression du popup d'exportation PDF non fonctionnel" },
				],
			},
			{
				version: 'v15.8.4', date: '9 mars 2026',
				changes: [
					{ type: 'fix', text: 'PDF vierge : draw-canvas redimensionné à la création' },
					{ type: 'fix', text: 'Images : toolbar hover recentrée après rotation' },
				],
			},
			{
				version: 'v15.8.3', date: '9 mars 2026',
				changes: [
					{ type: 'fix', text: "Images : boîte de survol tourne avec l'image" },
					{ type: 'fix', text: 'Images : pad hover box fixé à 6px' },
				],
			},
			{
				version: 'v15.8.2', date: '9 mars 2026',
				changes: [
					{ type: 'fix', text: 'Images : hit test dans repère local pour la rotation' },
					{ type: 'fix', text: 'Marquee : images incluses dans la sélection par drag' },
					{ type: 'fix', text: 'Images : bouton rotation toolbar fait -45°' },
				],
			},
			{
				version: 'v15.8.1', date: '9 mars 2026',
				changes: [
					{ type: 'fix', text: 'Images : boîte de sélection et handles tournent avec image' },
				],
			},
			{
				version: 'v15.8', date: '9 mars 2026',
				changes: [
					{ type: 'nouveau', text: 'Images : bouton rotation arc bas-gauche (drag libre)' },
					{ type: 'nouveau', text: 'Images : rotation stockée dans stroke.rotation' },
					{ type: 'amelio', text: 'Images : bouton 90° dans la toolbar utilise stroke.rotation' },
				],
			},
			{
				version: 'v15.7.6', date: '9 mars 2026',
				changes: [
					{ type: 'fix', text: 'Hover-toolbar : se repositionne après un clic rotation depuis la toolbar' },
				],
			},
			{
				version: 'v15.7.5', date: '8 mars 2026',
				changes: [
					{ type: 'fix', text: 'Hover-toolbar zone de texte : se repositionne correctement après une rotation' },
				],
			},
			{
				version: 'v15.7.4', date: '8 mars 2026',
				changes: [
					{ type: 'fix', text: 'Hover-toolbar : ancrée dans le pageContainer, ne bouge plus au scroll' },
				],
			},
			{
				version: 'v15.7.3', date: '8 mars 2026',
				changes: [
					{ type: 'amelio', text: "Bouton rotation : seul l'arc extérieur est visible" },
				],
			},
			{
				version: 'v15.7.2', date: '8 mars 2026',
				changes: [
					{ type: 'fix', text: 'Zone de texte : impossible de sortir du canvas' },
				],
			},
			{
				version: 'v15.7.1', date: '8 mars 2026',
				changes: [
					{ type: 'fix', text: "Rotation zone de texte : rotation par delta d'angle" },
				],
			},
			{
				version: 'v15.7', date: '8 mars 2026',
				changes: [
					{ type: 'nouveau', text: 'Zone de texte : bouton rotation circulaire au coin bas-gauche' },
					{ type: 'fix', text: 'Suppression zone de texte via X : hover-toolbar disparaît correctement' },
				],
			},
			{
				version: 'v15.6.1', date: '8 mars 2026',
				changes: [
					{ type: 'amelio', text: 'Interligne : valeurs en pt (0.7pt → 4.0pt), défaut 1.5pt' },
				],
			},
			{
				version: 'v15.6', date: '8 mars 2026',
				changes: [
					{ type: 'nouveau', text: "Barre de formatage : sélecteur d'interligne (×1 à ×2.5)" },
				],
			},
			{
				version: 'v15.5.2', date: '8 mars 2026',
				changes: [
					{ type: 'amelio', text: 'Aperçus du popup agrandis (260×340px)' },
				],
			},
			{
				version: 'v15.5.1', date: '8 mars 2026',
				changes: [
					{ type: 'amelio', text: '« Ajouter une page » en haute résolution (2×)' },
				],
			},
			{
				version: 'v15.5', date: '8 mars 2026',
				changes: [
					{ type: 'nouveau', text: '« Obtenir la même page » pour dupliquer une page existante' },
					{ type: 'nouveau', text: 'Sélecteur pour choisir la page source si plusieurs pages' },
				],
			},
			{
				version: 'v15.4', date: '8 mars 2026',
				changes: [
					{ type: 'fix', text: "Raccourcis clavier désactivés sur l'écran d'accueil" },
					{ type: 'fix', text: "Menus outils/vue fermés au retour à l'accueil" },
					{ type: 'fix', text: "Panneaux d'outils fermés au retour à l'accueil" },
				],
			},
			{
				version: 'v15.3', date: '8 mars 2026',
				changes: [
					{ type: 'amelio', text: 'Zone de texte : se colle autour du contenu à la désélection' },
					{ type: 'amelio', text: "Pas d'auto-fit si redimensionnée manuellement" },
				],
			},
			{
				version: 'v15.2', date: '8 mars 2026',
				changes: [
					{ type: 'amelio', text: 'Zone de texte hors du PDF : repositionnement automatique' },
				],
			},
			{
				version: 'v15.1', date: '8 mars 2026',
				changes: [
					{ type: 'amelio', text: 'Top-bar responsive — plus aucun chevauchement' },
				],
			},
			{
				version: 'v15', date: '4 mars 2026',
				changes: [
					{ type: 'nouveau', text: 'Authentification complète : connexion, inscription, SSO Google / Facebook / Spotify' },
					{ type: 'nouveau', text: 'Mode sans compte avec popup de bienvenue' },
					{ type: 'nouveau', text: 'Outils de dessin repensés : crayon, surligneur, épaisseur 1 à 80' },
					{ type: 'nouveau', text: 'Sélecteur de couleurs professionnel' },
					{ type: 'nouveau', text: 'Recherche Google Images intégrée' },
					{ type: 'nouveau', text: 'Intégration YouTube : coller un lien pour insérer une vidéo' },
					{ type: 'nouveau', text: "Personnalisation de la barre d'outils" },
					{ type: 'nouveau', text: "Fenêtre de paramètres dédiée à l'ajout de pages" },
					{ type: 'amelio', text: "Refonte massive de l'interface" },
				],
			},
			{
				version: 'v9.5', date: '1 mars 2026',
				changes: [
					{ type: 'amelio', text: 'Passage à Claude Sonnet 4.6 pour la génération du code' },
					{ type: 'amelio', text: 'Amélioration de la stabilité et de la réactivité' },
					{ type: 'amelio', text: 'Consolidation des fonctionnalités' },
				],
			},
			{
				version: 'v6.5.1', date: '28 février 2026',
				changes: [
					{ type: 'nouveau', text: 'Mode Présentation intégré' },
					{ type: 'nouveau', text: 'Rotation des pages (sens horaire et antihoraire)' },
					{ type: 'nouveau', text: 'Vue deux pages côte à côte' },
					{ type: 'nouveau', text: "Outil Masquage d'écran" },
					{ type: 'nouveau', text: 'Reconnaissance de texte OCR' },
					{ type: 'nouveau', text: "Thèmes avec choix de couleur d'accent" },
				],
			},
			{
				version: 'v6.5', date: '28 février 2026',
				changes: [
					{ type: 'nouveau', text: 'Ouverture depuis Google Drive et OneDrive' },
					{ type: 'nouveau', text: 'Création de PDF avancée : type, format, orientation, couleur' },
					{ type: 'nouveau', text: 'Édition de texte enrichie : polices, taille, gras, italique, souligné' },
					{ type: 'nouveau', text: 'Clavier de symboles mathématiques' },
					{ type: 'nouveau', text: 'Export avancé : original, annoté ou annotations seules' },
					{ type: 'nouveau', text: 'Menu des raccourcis clavier' },
				],
			},
			{
				version: 'v1.5', date: '14 février 2026',
				changes: [
					{ type: 'amelio', text: 'Rebranding : renommé « JacPDF »' },
					{ type: 'amelio', text: "Remaniement mineur de l'interface" },
				],
			},
			{
				version: 'v1.1', date: '14 février 2026',
				changes: [
					{ type: 'nouveau', text: 'Section Crédits dans les paramètres' },
				],
			},
			{
				version: 'v1.0', date: '14 février 2026',
				changes: [
					{ type: 'nouveau', text: 'Première version — interface Glassmorphism' },
					{ type: 'nouveau', text: 'Importation de PDF et création de documents vierges' },
					{ type: 'nouveau', text: 'Gestion des fichiers récents' },
					{ type: 'nouveau', text: 'Outils : Sélection, Texte, Signature, Gomme, Formes' },
					{ type: 'nouveau', text: 'Couleurs premier plan / arrière-plan' },
					{ type: 'nouveau', text: 'Exportation simple du PDF' },
					{ type: 'nouveau', text: 'Choix de la langue (Français / Anglais)' },
				],
			},
		],
	},

	jacdoc: {
		version: '1.0.0',
		entries: [
			{
				version: '1.0.0',
				date: '22 mai 2026',
				title: 'Premier release stable',
				changes: [
					{ type: 'nouveau', text: 'JacDoc sort de l’alpha — version stable 1.0' },
					{ type: 'nouveau', text: 'Éditeur de documents type pages A4' },
					{ type: 'nouveau', text: 'Commentaires collaboratifs ancrés au texte' },
					{ type: 'nouveau', text: 'Sauvegarde cloud Supabase' },
					{ type: 'nouveau', text: 'Partage par lien avec rôles (lecture / commentaire / édition)' },
				],
			},
			{
				version: 'v1 alpha', date: '11 mai 2026',
				changes: [
					{ type: 'refonte', text: "L'alpha de JacDoc est maintenant disponible" },
					{ type: 'nouveau', text: 'Éditeur ProseMirror multi-pages avec sauvegarde locale + miroir cloud' },
					{ type: 'nouveau', text: 'Toolbar et bubble menu de formatage' },
					{ type: 'nouveau', text: 'Barre de menus style traitement de texte' },
					{ type: 'nouveau', text: 'Accueil dédié — liste des documents récents' },
					{ type: 'nouveau', text: 'Panneau Paramètres adapté à JacDoc' },
				],
			},
		],
	},

	jactache: {
		version: '1.1.0',
		entries: [
			{
				version: '1.1.0',
				date: '23 mai 2026',
				title: 'Sidebar flottante façon Notion',
				changes: [
					{ type: 'nouveau', text: 'Paramètres › Apparence : option « Sidebar flottante ». La sidebar disparaît du flux et apparaît en superposition au survol du bord de l’écran ou en cliquant le bouton « panneau latéral » de la barre d’onglets JacSuite — comme dans Notion.' },
					{ type: 'changement', text: 'Flèche de la sidebar : retirée en mode fixe (la barre d’onglets prend le relais), et réaffectée en mode flottant pour désactiver le mode (équivalent du bouton de la tab bar)' },
					{ type: 'nouveau', text: 'Sidebar flottante en « carte inset » : marges de 12 px sur les côtés, coins arrondis et ombre portée' },
					{ type: 'nouveau', text: 'Zone de hover invisible collée au bord pour révéler la sidebar sans cliquer' },
					{ type: 'amelio', text: 'Fermeture automatique dès que la souris quitte la sidebar ; reste ouverte tant que le modal Paramètres est affiché' },
				],
			},
			{
				version: '1.0.0',
				date: '21 mai 2026',
				title: 'Premier release stable',
				changes: [
					{ type: 'nouveau', text: 'JacTâche sort de l’alpha — version stable 1.0' },
					{ type: 'nouveau', text: 'Sync cloud Supabase multi-appareils' },
					{ type: 'nouveau', text: 'Intégration JacCalendrier (échéances visibles)' },
				],
			},
			{
				version: 'v0.1 alpha', date: '17 mai 2026',
				changes: [
					{ type: 'refonte', text: "L'alpha de JacTâche est maintenant disponible" },
					{ type: 'nouveau', text: 'Création, édition et suppression de tâches' },
					{ type: 'nouveau', text: 'Projets personnalisables avec icône' },
					{ type: 'nouveau', text: "Filtres rapides : Aujourd'hui, À venir, Terminées" },
					{ type: 'nouveau', text: "Sous-tâches, tags, priorités et dates d'échéance" },
					{ type: 'nouveau', text: 'Conversion tâche ↔ événement via JacCalendrier' },
					{ type: 'nouveau', text: 'Raccourci « N » pour nouvelle tâche' },
					{ type: 'nouveau', text: 'Persistance locale via Zustand persist' },
					{ type: 'fix', text: 'Boucle de re-render infinie sur la liste corrigée' },
				],
			},
		],
	},

	jaccalendrier: {
		version: '1.1.0',
		entries: [
			{
				version: '1.1.0',
				date: '23 mai 2026',
				title: 'Sidebar flottante façon Notion',
				changes: [
					{ type: 'nouveau', text: 'Paramètres › Apparence : option « Sidebar flottante ». La sidebar disparaît du flux et apparaît en superposition au survol du bord de l’écran ou en cliquant le bouton « panneau latéral » de la barre d’onglets JacSuite — comme dans Notion.' },
					{ type: 'changement', text: 'Flèche de la sidebar : retirée en mode fixe (la barre d’onglets prend le relais), et réaffectée en mode flottant pour désactiver le mode (équivalent du bouton de la tab bar)' },
					{ type: 'nouveau', text: 'Sidebar flottante en « carte inset » : marges de 12 px sur les côtés, coins arrondis et ombre portée' },
					{ type: 'nouveau', text: 'Zone de hover invisible collée au bord pour révéler la sidebar sans cliquer' },
					{ type: 'amelio', text: 'Fermeture automatique dès que la souris quitte la sidebar ; reste ouverte tant que le modal Paramètres est affiché' },
				],
			},
			{
				version: '1.0.0',
				date: '21 mai 2026',
				title: 'Premier release stable',
				changes: [
					{ type: 'nouveau', text: 'JacCalendrier sort de l’alpha — version stable 1.0' },
					{ type: 'nouveau', text: 'Sync cloud Supabase + intégration JacTâche' },
				],
			},
			{
				version: 'v0.1 alpha', date: '17 mai 2026',
				changes: [
					{ type: 'refonte', text: "L'alpha de JacCalendrier est maintenant disponible" },
					{ type: 'nouveau', text: 'Vue mensuelle avec navigation' },
					{ type: 'nouveau', text: 'Calendriers multiples avec palette 8 couleurs' },
					{ type: 'nouveau', text: 'Toggle de visibilité par calendrier' },
					{ type: 'nouveau', text: "Création, édition et suppression d'événements" },
					{ type: 'nouveau', text: 'Mode toute la journée ou horaires précis' },
					{ type: 'nouveau', text: "Intégration JacTâche : pastilles pour échéances" },
					{ type: 'nouveau', text: 'Mini-mois interactif dans la sidebar' },
					{ type: 'nouveau', text: 'Persistance locale via Zustand persist' },
				],
			},
		],
	},

	jacnote: {
		version: '1.2.0',
		entries: [
			{
				version: '1.2.0',
				date: '23 mai 2026',
				title: 'Sidebar flottante façon Notion',
				changes: [
					{ type: 'nouveau', text: 'Paramètres › Apparence : option « Sidebar flottante ». La sidebar disparaît du flux et apparaît en superposition au survol du bord de l’écran ou en cliquant le bouton hamburger, comme dans Notion.' },
					{ type: 'nouveau', text: 'Bouton « panneau latéral » intégré à la barre d’onglets JacSuite (à côté des chips de groupes) — toujours visible, bascule le mode flottant on/off d’un clic, et reste surligné quand le mode est actif' },
					{ type: 'changement', text: 'Flèche de la sidebar : retirée en mode fixe (la barre d’onglets prend le relais), et réaffectée en mode flottant pour désactiver le mode (équivalent du bouton de la tab bar)' },
					{ type: 'fix', text: 'La sidebar flottante reste ouverte tant que le modal Paramètres est affiché (le mouseleave ne la referme plus pendant la configuration)' },
					{ type: 'fix', text: 'Sidebar flottante : plus de bascule ouvre/ferme quand la souris reste dans la bande entre la sidebar et le bord (le glissement de la sidebar sous le curseur ne déclenche plus la fermeture automatique)' },
					{ type: 'nouveau', text: 'Sidebar flottante en « carte inset » : marges de 12 px sur les côtés, coins arrondis et ombre portée, au lieu de prendre toute la hauteur de l’écran' },
					{ type: 'nouveau', text: 'Zone de hover invisible collée au bord pour révéler la sidebar sans cliquer' },
					{ type: 'amelio', text: 'Fermeture automatique dès que la souris quitte la sidebar, avec une légère tolérance pour les popovers' },
				],
			},
			{
				version: '1.1.0',
				date: '23 mai 2026',
				title: 'Dossiers en couleur et organisation',
				changes: [
					{ type: 'nouveau', text: 'Bouton de tri des dossiers dans la sidebar (manuel, A→Z, Z→A, par couleur)' },
					{ type: 'nouveau', text: 'Menu « … » au survol d’une note : Renommer, Déplacer, Tags, Supprimer' },
					{ type: 'nouveau', text: 'Tags : ajout / retrait via le menu d’une note, suggestions, et section Tags dans la sidebar' },
					{ type: 'nouveau', text: 'Clic sur un #tag dans une note ou la sidebar pour filtrer toutes les notes du tag' },
					{ type: 'nouveau', text: 'Menu « … » au survol d’un dossier : Ajouter une note, sous-dossier, Couleur, Renommer, Supprimer' },
					{ type: 'nouveau', text: 'Couleur d’un dossier : palette Apple-style (9 teintes) + bouton « personnalisée » qui ouvre ColorPicker (roue chromatique + hex)' },
					{ type: 'nouveau', text: 'L’icône d’un dossier coloré prend sa couleur partout : sidebar, en-tête de la liste et breadcrumb des dossiers parents' },
					{ type: 'fix', text: 'Sélection d’un dossier dans la sidebar : prend maintenant toute la largeur' },
					{ type: 'nouveau', text: 'Clic droit sur la Corbeille : menu « Vider la corbeille »' },
					{ type: 'nouveau', text: 'Bouton « … » dans l’en-tête de la liste : choix entre vue liste et vue galerie' },
				],
			},
			{
				version: '1.0.0',
				date: '22 mai 2026',
				title: 'Premier release stable',
				changes: [
					{ type: 'nouveau', text: 'JacNote sort de l’alpha — version stable 1.0' },
					{ type: 'nouveau', text: 'Sync cloud Supabase temps réel multi-appareils' },
					{ type: 'nouveau', text: 'Filets de sécurité : visibility re-pull + sync multi-onglets' },
					{ type: 'nouveau', text: 'Paramètres complets intégrés à FullSettingsModal' },
					{ type: 'amelio', text: 'Corbeille masquée de la sidebar quand elle est vide' },
				],
			},
			{
				version: 'v0.5 alpha', date: '17 mai 2026',
				changes: [
					{ type: 'nouveau', text: 'Sidebar JacNote : workspace, recherche, liste, footer' },
					{ type: 'nouveau', text: 'Éditeur fonctionnel : titre + contenu avec persistance' },
					{ type: 'nouveau', text: "Création, suppression et changement d'icône" },
					{ type: 'nouveau', text: 'Recherche locale en temps réel' },
					{ type: 'nouveau', text: 'Store local-first jacnoteStore + hook useJacNote' },
					{ type: 'nouveau', text: 'Persistance localStorage' },
					{ type: 'nouveau', text: 'Seed de 5 pages de bienvenue' },
					{ type: 'nouveau', text: 'État vide avec bouton de création rapide' },
				],
			},
		],
	},

	jacslide: {
		version: '0.0.0',
		entries: [
			{
				version: 'v0', date: '—',
				changes: [
					{ type: 'bientot', text: 'JacSlide bientôt disponible' },
				],
			},
		],
	},

	jacpaint: {
		version: '1.4.0',
		entries: [
			{
				version: '1.4.0',
				date: '30 mai 2026',
				title: 'Cloud JacPaint branché sur JacSuite Cloud',
				changes: [
					{ type: 'refonte', text: 'Le cloud de JacPaint affiche désormais le même JacSuite Cloud central, filtré sur vos toiles, avec les dossiers partagés de toute la suite (façon Google Drive ↔ Docs).' },
					{ type: 'amelio', text: 'Sélecteur de toiles cloud rebâti sur le navigateur cloud unifié de JacSuite : dossiers, recherche, renommer, supprimer et déplacer, cohérents avec les autres apps.' },
				],
			},
			{
				version: '1.3.0',
				date: '30 mai 2026',
				title: 'Historique de versions réservé aux plans Pro et Premium',
				changes: [
					{ type: 'changement', text: 'L’historique de versions (snapshots manuels et automatiques, avec restauration) est désormais réservé aux abonnés Pro et Premium. Les comptes Gratuit voient la fenêtre d’abonnement quand ils tentent de l’ouvrir, et les snapshots automatiques sont suspendus pour eux.' },
				],
			},
			{
				version: '1.2.0',
				date: '25 mai 2026',
				title: 'JacPaint Cloud — sync automatique & partage par lien',
				changes: [
					{ type: 'nouveau', text: "JacPaint Cloud est ENFIN là — vos toiles se synchronisent automatiquement entre tous vos appareils via JacSuite Cloud (Supabase). Connectez-vous une fois, vos toiles vous suivent partout." },
					{ type: 'nouveau', text: "Picker cloud dédié aligné sur JacDoc et JacPDF — 3 vues (Mes toiles, Partagées avec moi, Récentes), recherche, dossiers créables et imbriqués, miniatures signées, breadcrumb de navigation." },
					{ type: 'nouveau', text: "Partage par lien public en lecture seule — créez un lien partageable avec n'importe qui (même sans compte JacSuite), choisissez l'expiration (jamais, 24 h, 7 j ou 30 j), désactivez ou révoquez à tout moment." },
					{ type: 'nouveau', text: "Page publique de visualisation — le visiteur voit la toile en plein écran avec damier de transparence, peut télécharger le PNG en un clic, et est invité à découvrir JacPaint via le bouton « Ouvrir JacPaint »." },
					{ type: 'nouveau', text: "Indicateur de sauvegarde JacPaint dans la topbar, cloné sur celui de JacPDF — pastille verte ✓ « Sauvegardé il y a X min » au repos, anneau animé « Sauvegarde… » pendant l'upload, pastille rouge en cas d'erreur, tooltip avec timestamp complet." },
					{ type: 'nouveau', text: "Sync automatique configurable dans Paramètres › Cloud — temps réel, toutes les 30 s, toutes les minutes, toutes les 5 min ou manuel uniquement. Déclenchement intelligent après chaque modification de la toile." },
					{ type: 'nouveau', text: "Migration douce de vos toiles locales vers le cloud — à votre premier clic sur le picker cloud, JacPaint propose de copier vos toiles existantes en un clic, avec barre de progression, comptage « X / Y réussies » et récapitulatif d'erreurs." },
					{ type: 'amelio', text: "Section Cloud & sauvegarde dans la modale Paramètres : remplace l'aperçu « bientôt » par les vraies options (fournisseur par défaut, fréquence de sync, notifications de sync, snapshots cloud, versionning, conflits, copies hors-ligne)." },
					{ type: 'amelio', text: "Bouton « Partager » ajouté dans la barre d'actions de chaque ligne du picker cloud, côté propriétaire — ouvre la modale de gestion des liens (créer, copier, expiration, activer/désactiver, révoquer)." },
					{ type: 'amelio', text: "Format de stockage cloud : chaque toile est sauvée en PNG aplati + miniature 240 px, avec dossiers et métadonnées persistés dans Supabase. Format multi-calques .jacpaint complet prévu pour une prochaine version." },
				],
			},
			{
				version: '1.1.0',
				date: '25 mai 2026',
				title: 'Paramètres complets dans la modale unifiée',
				changes: [
					{ type: 'nouveau', text: "JacPaint a maintenant son propre onglet dans la modale Paramètres unifiée de JacSuite (avatar en haut à droite). 7 catégories : Général, Apparence, Édition, Export, Cloud & sauvegarde, Raccourcis, Avancé." },
					{ type: 'nouveau', text: "Général : action au démarrage, confirmation avant fermeture non sauvegardée, langue de l'interface." },
					{ type: 'nouveau', text: "Apparence : couleur de fond du canvas, taille du damier de transparence, vitesse du marching ants, couleur d'accent, affichage de la pill de zoom." },
					{ type: 'nouveau', text: "Édition : outil au démarrage, tailles par défaut crayon / marqueur / gomme, opacité par défaut, niveau de stabilisateur, dimensions par défaut de nouvelle toile, couleur de fond par défaut, modèle de nom personnalisable." },
					{ type: 'nouveau', text: "Export : format par défaut (PNG / JPEG / WebP / PDF), qualité JPEG, copie dans presse-papier au lieu du téléchargement." },
					{ type: 'nouveau', text: "Raccourcis : tous les raccourcis JacPaint sont maintenant rebindables (B / M / E / V / G / ⌘Z / ⌘⇧Z / ⌘S, etc.)." },
					{ type: 'nouveau', text: "Avancé : qualité des miniatures, throttle des pointer events, taille max de l'historique défaire / refaire (30 / 60 / 120 / 300 étapes), désactivation des effets lourds sur grande toile." },
					{ type: 'bientot', text: "Section Cloud & sauvegarde : aperçu de JacCloud (sync Supabase entre vos appareils, partage par lien, historique de versions cloud). Disponible en JacPaint 1.2." },
					{ type: 'amelio', text: "Modal Paramètres : JacPaint n'est plus une app « Bientôt » — il rejoint JacPDF / JacDoc / JacNote / JacTâche / JacCalendrier dans la sidebar." },
				],
			},
			{
				version: '1.0.0',
				date: '25 mai 2026',
				title: '🎉 Premier release stable — JacPaint sort de l’alpha',
				changes: [
					{ type: 'refonte', text: 'JacPaint atteint la version 1.0 stable après 12 sprints intensifs — l’éditeur de peinture de JacSuite est désormais une vraie alternative locale à Photoshop / Procreate / Canva pour le travail créatif raster.' },
					{ type: 'nouveau', text: '10 outils complets : crayon (avec 7 presets et stabilisateur 5 niveaux), marqueur, gomme, remplissage, pipette, texte (5 polices), formes (rectangle / cercle / triangle), lignes (droite / flèche / tiretée / pointillée / courbe à N points), sélection (5 sous-modes), main.' },
					{ type: 'nouveau', text: '5 sous-modes de sélection avec masques pixel-perfect : flèche (sélection objet), rectangle marquee, baguette magique (tolérance réglable), lasso libre, lasso polygonal. Plus inverser, plumer, pivoter librement.' },
					{ type: 'nouveau', text: 'Système de calques pro : 16 modes de fusion, opacité par calque, visibilité, verrouillage, masques alpha, groupes, calques d’ajustement non-destructifs avec 16 filtres disponibles (luminosité, contraste, saturation, teinte, inversion, niveaux de gris, sépia, flou gaussien, flou directionnel, netteté, contours Sobel, bas-relief, vignette, vintage, pixélisation, bruit).' },
					{ type: 'nouveau', text: 'Couleur complète : 3 types de dégradés (linéaire / radial / conique) avec stops draggables et alpha, 18 préréglages, 6 modes d’harmonies (complémentaire, triadique, analogues, tétradique, complémentaire divisée, monochrome), palettes personnalisées persistées, picker HSV, couleurs récentes.' },
					{ type: 'nouveau', text: 'Import d’images, redimensionnement de toile avec 4 modes (adapter / remplir / étirer / coin haut-gauche) et 8 préréglages, rognage à la sélection, export PNG / JPG / WebP / PDF (3 formats).' },
					{ type: 'nouveau', text: 'Navigation pro : zoom à la molette centré sur le curseur, mode focus (F), minimap flottante, règles, grille, guides, et 25+ raccourcis clavier (B/E/M/L/U/T/I/G/V/W/Q/P/H/R/F, Cmd+=/0/1, Cmd+Shift+N, Cmd+J, Suppr, flèches de nudge).' },
					{ type: 'nouveau', text: 'Galerie de modèles : 20 préréglages en 4 catégories (Papier, Réseaux sociaux, Fonds d’écran, Créatif) + modèles personnels persistés.' },
					{ type: 'nouveau', text: 'Sauvegarde robuste : autosave continu en IndexedDB avec indicateur visuel dans la topbar, export/import du projet en .jacpaint (bundle JSON self-contained), snapshots manuels et automatiques (toutes les 5 min) avec restauration en un clic.' },
					{ type: 'nouveau', text: 'Historique défaire / refaire jusqu’à 60 étapes avec Cmd/Ctrl+Z et Cmd/Ctrl+Shift+Z, conservé pendant toute la session.' },
					{ type: 'amelio', text: 'Performance : refresh ciblé des panneaux via layersVersion, throttling des miniatures, composite layers optimisé pour les grandes toiles (4K supporté).' },
				],
			},
			{
				version: '0.12.0',
				date: '25 mai 2026',
				title: 'Snapshots & versions locales — historique en IndexedDB',
				changes: [
					{ type: 'nouveau', text: "Snapshots locaux en IndexedDB : chaque snapshot stocke le projet complet (toutes couches PNG + métadonnées) + une miniature 160 px du composite. Persistance entre sessions, pas de limite de taille raisonnable (IndexedDB autorise plusieurs Go)." },
					{ type: 'nouveau', text: "Auto-snapshot toutes les 5 minutes si la toile a changé depuis le dernier snapshot. Max 10 auto-snapshots par peinture (FIFO sur les plus vieux). Les snapshots manuels ne sont jamais supprimés automatiquement." },
					{ type: 'nouveau', text: "Modal Snapshots & versions (menu Vue) : liste chronologique avec miniature, libellé, date formatée en français, dimensions et nombre de calques. Filtres Tous / Manuels / Automatiques." },
					{ type: 'nouveau', text: "Création manuelle : bouton « Créer un snapshot » dans la modal, prompt pour nommer le snapshot. Marqueur ⭐ pour les manuels, 🕒 pour les automatiques." },
					{ type: 'nouveau', text: "Restauration : confirmation requise (rappel de créer un snapshot avant si besoin), puis remplacement complet des calques. Le canvas est redimensionné si le snapshot a d'autres dimensions." },
					{ type: 'amelio', text: "Renommage et suppression des snapshots directement dans la modal (icones ✎ et × au survol de chaque ligne)." },
				],
			},
			{
				version: '0.11.0',
				date: '25 mai 2026',
				title: 'Export/import .jacpaint et indicateur d’autosave',
				changes: [
					{ type: 'nouveau', text: "Export du projet en .jacpaint (menu Vue) : bundle JSON self-contained avec dimensions, nom, et toutes les couches en PNG dataURL incluant blend mode, opacité, visibilité, verrouillage et groupes. Idéal comme sauvegarde locale ou pour transférer un projet entre machines." },
					{ type: 'nouveau', text: "Import .jacpaint (menu Vue → Importer un projet…) : valide le format, redimensionne la toile si nécessaire en mode rognage, et restaure toutes les couches d'un coup. Erreurs d'image ou de format affichées proprement." },
					{ type: 'nouveau', text: "Indicateur d'autosave dans la topbar : pastille ✓ verte « Sauvegardé il y a X min » au repos, anneau violet rotatif « Sauvegarde… » pendant 1.2 s après chaque modification (debouncé), pastille rouge en cas d'erreur. Tooltip avec timestamp complet." },
					{ type: 'amelio', text: "Nom du fichier export auto-généré à partir du nom de la peinture + date du jour (ex. mon-dessin-2026-05-25.jacpaint) avec normalisation des caractères spéciaux." },
					{ type: 'amelio', text: "L'indicateur d'autosave masque automatiquement son libellé sur les écrans étroits (<900 px) pour conserver l'icone uniquement." },
				],
			},
			{
				version: '0.10.0',
				date: '25 mai 2026',
				title: 'Galerie de modèles — 20 préréglages + modèles personnels',
				changes: [
					{ type: 'nouveau', text: "Modal Modèles (menu Vue → Modèles…) avec 20 préréglages répartis en 4 catégories : Papier (A4, Letter, A5, carte postale, carte d'affaires), Réseaux sociaux (Instagram carré/portrait/story, YouTube thumb, bannieres Twitter/LinkedIn, couv Facebook), Fonds d'écran (iPhone, Android, Full HD, 4K) et Créatif (mood board, sketchbook, page BD, pixel art 32×32 et 64×64)." },
					{ type: 'nouveau', text: "Cliquer sur un modèle redimensionne la toile aux dimensions du préréglage en mode rognage — le contenu existant est préservé, recentré si la nouvelle taille le permet." },
					{ type: 'nouveau', text: "Modèles personnels : bouton « Sauvegarder comme modèle » dans la modal capture la toile actuelle (dimensions + miniature PNG 240 px) et la persiste dans localStorage. Limité à 50 modèles personnels (FIFO)." },
					{ type: 'nouveau', text: "Filtre par catégories : pills cliquables au-dessus de la grille pour basculer entre Tous, Papier, Réseaux sociaux, Fonds d'écran, Créatif et Mes modèles." },
					{ type: 'nouveau', text: "Prévisualisation visuelle de chaque modèle : aperçu coloré au ratio exact (ex. la story Instagram s'affiche en portrait, la mini YouTube en paysage) avec icône contextuelle et dimensions en monospace." },
					{ type: 'amelio', text: "Suppression d'un modèle personnel via la croix qui apparaît au survol de la carte — confirmation requise pour éviter une suppression accidentelle." },
				],
			},
			{
				version: '0.9.0',
				date: '25 mai 2026',
				title: 'Navigation pro, mode focus et 25+ raccourcis clavier',
				changes: [
					{ type: 'nouveau', text: "Zoom à la molette — Cmd/Ctrl + roulette zoome de 10 % à la fois, centré sur la position du curseur (comme dans Figma / Canva)." },
					{ type: 'nouveau', text: "Mode focus — touche F (ou menu Vue) bascule en mode focus : topbar et panneau des calques masqués, la toile prend toute la fenêtre. Un bouton flottant en haut à droite permet de quitter le mode, comme la touche Échap." },
					{ type: 'nouveau', text: "Minimap flottante en bas à droite — aperçu réduit du composite + rectangle viewport draggable pour naviguer rapidement sur les grandes toiles. Toggle via le menu Vue." },
					{ type: 'nouveau', text: "Règles horizontale et verticale en pixels-canvas — graduations adaptatives au zoom, ligne de position du curseur sur les deux axes. Toggle via R ou le menu Vue." },
					{ type: 'nouveau', text: "Grille de référence — quadrillage de 20 px-canvas, lignes principales toutes les 5 graduations. Toggle via apostrophe (’) ou le menu Vue." },
					{ type: 'nouveau', text: "25+ raccourcis clavier : B crayon, E gomme, M marqueur, L ligne, U forme, T texte, I pipette, G remplissage, V sélection flèche, W baguette magique, Q lasso libre, P lasso polygonal, H main, R règles, F focus, Cmd/= et Cmd/- zoom in/out, Cmd/0 à 100 %, Cmd/1 adapter à l'écran, Cmd/J dupliquer la sélection, Cmd/Shift/N nouveau calque, Suppr efface la sélection, flèches déplacent la sélection de 1 px (Shift+flèche = 10 px)." },
					{ type: 'amelio', text: "Échap quitte le mode focus en plus d'annuler une sélection ou un polygone en cours — sortie en un appui même quand la topbar est cachée." },
				],
			},
			{
				version: '0.8.0',
				date: '25 mai 2026',
				title: "Import d'images, redimensionnement de toile, rognage et export PDF",
				changes: [
					{ type: 'nouveau', text: "Importer une image (PNG, JPG, WebP, GIF, SVG) depuis le disque — nouveau bouton dédié dans la topbar, l'image est centrée et adaptée aux dimensions de la toile sur une nouvelle couche déplaçable comme n'importe quelle autre." },
					{ type: 'nouveau', text: "Redimensionner la toile via une modale complète — 8 préréglages (A4 portrait/paysage, Lettre US, HD 1920×1080, 4K, carrés 1080/2048, Story Instagram 1080×1920) + dimensions personnalisées avec lien de ratio + 4 modes (Adapter, Remplir, Étirer, Coin haut-gauche). Accessible depuis le menu Vue de la topbar." },
					{ type: 'nouveau', text: "Rogner la toile à la sélection — nouveau bouton dédié dans la barre d'actions flottante de sélection, recadre la toile et toutes les couches à la bounding box de la sélection courante." },
					{ type: 'nouveau', text: "Exporter en PDF — trois formats au choix dans le menu Exporter de la topbar : adapté à la toile (1 px = 1 pt), A4 portrait (595×842 pt) ou Lettre US (612×792 pt). Le composite est aplati sur fond blanc puis embarqué en JPEG dans un PDF 1.4 généré sans dépendance externe." },
					{ type: 'amelio', text: "Le menu Exporter est désormais structuré en deux sections : images (PNG / JPG / WebP) et PDF — plus lisible quand la palette d'options s'étoffe." },
				],
			},
			{
				version: '0.7.0',
				date: '25 mai 2026',
				title: '16 filtres et calques d\'ajustement complètement révolutionnés',
				changes: [
					{ type: 'nouveau', text: '16 filtres regroupés en 4 catégories — Couleur : luminosité, contraste, saturation, rotation de teinte, inversion, niveaux de gris, sépia. Flou : gaussien, directionnel (distance + angle). Stylisation : netteté, détection de contours (Sobel), bas-relief, vignette, vintage. Distorsion : pixélisation, bruit.' },
					{ type: 'refonte', text: 'Calques d\'ajustement complètement refondus : tout filtre peut désormais être empilé comme calque non-destructif, masqué, verrouillé, réordonné ou supprimé sans toucher aux pixels d\'origine.' },
					{ type: 'amelio', text: 'Le menu « Ajust. » du panneau des calques regroupe les 16 filtres par catégorie au lieu des 3 ajustements basiques de Phase 3.' },
					{ type: 'fix', text: 'Bouton « Appliquer ce dégradé » : le dégradé recolore désormais correctement les pixels opaques de la couche cible quand aucune sélection n\'est active (auparavant le dégradé était invisible à cause d\'une normalisation de masque incorrecte).' },
				],
			},
			{
				version: '0.6.0',
				date: '25 mai 2026',
				title: 'Dégradés, harmonies de couleur & palettes personnalisées',
				changes: [
					{ type: 'nouveau', text: 'Appliquez n\'importe quel dégradé (linéaire, radial ou conique) sur la couche active ou sur une sélection — éditeur complet : stops draggables, alpha par stop, angle libre 0°..360°, motif répétitif.' },
					{ type: 'nouveau', text: '18 dégradés préréglés à appliquer en un clic depuis le panneau couleur → onglet « Dégradé de couleur ».' },
					{ type: 'nouveau', text: 'Section Harmonies dans le panneau couleur — 6 modes calculés depuis la couleur de l\'élément : complémentaire, triadique, analogues, tétradique, complémentaire divisée, monochrome.' },
					{ type: 'nouveau', text: 'Palettes personnalisées : enregistrez la palette courante (couleurs récentes + dominantes de la toile) sous un nom, rappelez-la d\'un clic, supprimez-la avec confirmation. Persisté localement.' },
					{ type: 'amelio', text: 'Les pastilles générées par les harmonies et les palettes sont cliquables comme n\'importe quel swatch standard — elles appliquent la couleur à la sélection.' },
					{ type: 'amelio', text: 'L\'éditeur de dégradé avancé (popup Personnaliser) gère désormais le type conique en plus du linéaire et du radial.' },
				],
			},
			{
				version: '0.5.0',
				date: '25 mai 2026',
				title: 'Sélections avancées : lasso, polygone, baguette magique, plumage, rotation',
				changes: [
					{ type: 'nouveau', text: 'Lasso libre — dessinez à main levée pour sélectionner une zone arbitraire de la toile.' },
					{ type: 'nouveau', text: 'Lasso polygonal — cliquez pour ajouter des sommets, refermez sur le 1er point ou pressez ⏎ pour valider.' },
					{ type: 'nouveau', text: 'Baguette magique — sélectionne tous les pixels connectés de couleur similaire (tolérance réglable 0..128).' },
					{ type: 'nouveau', text: 'Inverser la sélection — bouton dans la barre d\'actions flottante, sélectionne tout sauf la zone courante.' },
					{ type: 'nouveau', text: 'Plumage (feather) — adoucit les bords de la sélection sur 0..30 px, via boxBlur du mask.' },
					{ type: 'nouveau', text: 'Rotation libre — pivote la sélection à un angle arbitraire ±180° autour de son centroïde, avec 4 angles rapides (-90°, -45°, +45°, +90°).' },
					{ type: 'nouveau', text: '⌘A pour sélectionner toute la toile, ⌘D pour désélectionner, Échap pour annuler le polygone en cours.' },
					{ type: 'amelio', text: 'Toute sélection de zone est automatiquement promue en couche autonome — compatible avec déplacement, duplication, fusion, recoloration, masque.' },
					{ type: 'amelio', text: 'Aperçu en direct du lasso libre et du lasso polygonal pendant la construction, avec marqueurs sur les sommets.' },
					{ type: 'amelio', text: 'Curseur dédié pour chaque sous-mode de sélection (croix pour lasso/polygone, cellule pour baguette).' },
				],
			},
			{
				version: '0.4.0',
				date: '25 mai 2026',
				title: 'Calques avancés : fusion, opacité, masques, ajustement',
				changes: [
					{ type: 'nouveau', text: '16 modes de fusion par calque : Normal, Multiplier, Écran, Superposition, Obscurcir, Éclaircir, Densité couleur + et −, Lumière crue, Lumière tamisée, Différence, Exclusion, Teinte, Saturation, Couleur, Luminosité' },
					{ type: 'nouveau', text: 'Opacité par calque (curseur 0 à 100 %) avec aperçu en direct dans la toile et badge de pourcentage sur la ligne du panneau' },
					{ type: 'nouveau', text: 'Bouton 👁 sur chaque calque pour le masquer/afficher sans le supprimer ; la miniature s’atténue quand un calque est masqué' },
					{ type: 'nouveau', text: 'Bouton 🔒 pour verrouiller un calque (la ligne se hachure et indique l’état)' },
					{ type: 'nouveau', text: 'Calques d’ajustement : Luminosité, Inversion, Niveaux de gris — affectent en direct tout ce qui est dessous dans la pile, sans détruire les couches sources' },
					{ type: 'nouveau', text: 'Groupes de calques (boîte 📁) pour organiser la pile' },
					{ type: 'nouveau', text: 'Masque alpha par calque : on ajoute un masque blanc qui peut être édité ultérieurement pour révéler ou cacher des zones du calque sans toucher au calque source' },
					{ type: 'nouveau', text: 'En-tête du panneau Calques : 3 boutons d’action rapide « + Calque », « + Groupe », « + Ajust. »' },
					{ type: 'amelio', text: 'Chaque ligne du panneau Calques expose désormais un chevron ⌄ qui déplie un panneau de réglages avancés (sélecteur de mode de fusion + curseur d’opacité + bouton masque), sans encombrer la liste' },
					{ type: 'amelio', text: 'Libellés étoffés dans le panneau : reconnaissance des courbes, textes (avec aperçu du contenu), calques d’ajustement et groupes' },
				],
			},
			{
				version: '0.3.0',
				date: '25 mai 2026',
				title: 'Pipette, Texte, presets, stabilisateur et miroir',
				changes: [
					{ type: 'nouveau', text: 'Outil Pipette dans la barre d’outils : cliquez n’importe où sur la toile pour piocher une couleur. Elle est automatiquement assignée à votre brosse précédente et ajoutée aux couleurs récentes' },
					{ type: 'nouveau', text: 'Outil Texte dédié : cliquez sur la toile pour ouvrir un éditeur flottant (police, taille, gras, italique, souligné, barré, alignement, couleur). Validation au ⌘+Entrée, annulation à Échap' },
					{ type: 'nouveau', text: '5 polices intégrées (Sans, Serif, Mono, Display, Manuscrit) et tailles 8 à 400 px' },
					{ type: 'nouveau', text: 'Sept préréglages de brosse pour le crayon et le marqueur : Rond, Doux, Calligraphie, Crayon texturé, Marqueur, Aérographe, Gomme — chacun avec sa propre dureté, son flow, son spacing et sa sensibilité à la pression' },
					{ type: 'nouveau', text: 'Pression du stylet supportée : la taille du trait se module en temps réel avec la pression captée par le navigateur (tablette graphique ou Apple Pencil)' },
					{ type: 'nouveau', text: 'Stabilisateur de trait : 5 niveaux (Désactivé, Léger, Moyen, Fort, Maximum) pour lisser les tracés à main levée à la Procreate' },
					{ type: 'nouveau', text: 'Dessin en miroir : 4 axes activables en parallèle (vertical, horizontal, diagonale, anti-diagonale) — chaque coup de crayon est dupliqué symétriquement en direct' },
					{ type: 'amelio', text: 'Le sous-menu du Crayon et du Marqueur expose désormais un sélecteur de style, un sélecteur de stabilisateur, et des bascules de miroir' },
				],
			},
			{
				version: '0.2.0',
				date: '24 mai 2026',
				title: 'Outils Formes et Lignes',
				changes: [
					{ type: 'nouveau', text: 'Outil Formes câblé : rectangle, cercle/ellipse et triangle se tracent à la souris sur la toile' },
					{ type: 'nouveau', text: 'Choix « Contour » ou « Plein » pour toutes les formes' },
					{ type: 'nouveau', text: 'Outil Lignes dédié dans la barre d’outils, avec 5 types : droite, flèche, tiretée, pointillée et courbe' },
					{ type: 'nouveau', text: 'Ligne courbe : on trace une droite, puis on glisse la poignée centrale pour la plier (Bézier quadratique)' },
					{ type: 'nouveau', text: 'Toute ligne (droite, flèche, tiretée, pointillée, courbe) affiche 2 poignées d’extrémité draggables juste après le tracé — on peut rallonger ou ré-orienter sans tout refaire' },
					{ type: 'amelio', text: 'Sélectionner une ligne avec la flèche affiche les mêmes poignées d’extrémité (et la poignée de pliage pour la courbe) au lieu d’une boîte rectangulaire — on peut ré-éditer une ligne après coup' },
					{ type: 'nouveau', text: 'Paramètres de la ligne courbe : curseur « Nombre de points » (1 à 6). Chaque point ajouté crée une poignée draggable supplémentaire sur la courbe — on peut donc tracer une seule ligne avec plusieurs courbes (S, vagues, sinusoïdes…)' },
					{ type: 'nouveau', text: 'Aperçu en direct pendant le tracé d’une forme ou d’une ligne' },
					{ type: 'amelio', text: 'Chaque forme ou ligne devient une couche distincte — sélectionnable, déplaçable, dupliquable et retournable comme les traits du crayon' },
					{ type: 'nouveau', text: 'Poignées de redimensionnement sur la sélection : 4 coins + 4 milieux de bord, comme dans JacPDF (sauf le triangle, qui a ses propres poignées)'
				},
				{
					type: 'nouveau',
					text: 'Triangle déformable par ses 3 sommets : on tire un coin pour bouger ce sommet sans toucher aux autres, et la poignée centrale déplace le triangle entier' },
				],
			},
			{
				version: '0.1.0',
				date: '23 mai 2026',
				title: 'Première mouture — accueil et onglets',
				changes: [
					{ type: 'nouveau', text: 'JacPaint démarre — accueil dédié dans son propre onglet' },
					{ type: 'nouveau', text: 'Menu Applications de toutes les apps : la tuile JacPaint est maintenant cliquable (plus de modale « Bientôt »)' },
					{ type: 'nouveau', text: 'Carte JacPaint dans le launcher JacSuite : activée et reliée à l’accueil JacPaint' },
					{ type: 'nouveau', text: 'Gestion d’onglets : Accueil JacPaint (/jacsuite/jacpaint) et toile (/jacsuite/jacpaint/painting/:id) avec deep-links' },
					{ type: 'nouveau', text: 'Persistance locale des toiles via un store IndexedDB minimal' },
					{ type: 'nouveau', text: 'Création de toile avec presets de format (A4, carré, HD, personnalisé)' },
					{ type: 'bientot', text: 'Éditeur de toile (canvas, pinceaux, calques) — à venir dans une prochaine étape' },
				],
			},
			{
				version: 'v0', date: '—',
				changes: [
					{ type: 'bientot', text: 'JacPaint bientôt disponible' },
				],
			},
		],
	},

	classroom: {
		version: '0.4.0',
		entries: [
			{
				version: '0.4.0',
				date: '30 mai 2026',
				title: 'Correction des copies dans JacPDF',
				changes: [
					{ type: 'nouveau', text: 'Corrigez les devoirs rendus directement dans JacPDF : annotez la copie de l’élève, ajoutez des commentaires et renvoyez-la corrigée sans quitter Classroom.' },
					{ type: 'nouveau', text: 'Note et appréciation par élève : attribuez une note et un mot personnalisé à chaque copie rendue.' },
					{ type: 'amelio', text: 'Vue « À corriger » qui regroupe toutes les copies rendues en attente de correction, triées par date de remise.' },
				],
			},
			{
				version: '0.3.0',
				date: '24 mai 2026',
				title: 'Remise des devoirs par les élèves',
				changes: [
					{ type: 'nouveau', text: 'Les élèves peuvent rendre un devoir en téléversant un PDF ou en joignant un fichier de JacSuite Cloud, avant la date d’échéance.' },
					{ type: 'nouveau', text: 'Suivi des remises côté enseignant : voyez d’un coup d’œil qui a rendu, qui est en retard et qui n’a rien remis.' },
					{ type: 'nouveau', text: 'Date d’échéance et rappels : chaque devoir affiche son échéance, et les élèves sont prévenus à l’approche de la date limite.' },
					{ type: 'amelio', text: 'Flux de la classe trié par date : devoirs, annonces et documents partagés apparaissent dans l’ordre chronologique.' },
				],
			},
			{
				version: '0.2.0',
				date: '18 mai 2026',
				title: 'Devoirs et distribution de documents',
				changes: [
					{ type: 'nouveau', text: 'Créez des devoirs avec énoncé, pièces jointes et date d’échéance, puis distribuez-les à toute la classe en un clic.' },
					{ type: 'nouveau', text: 'Distribuez un document à tous les élèves : chacun reçoit automatiquement sa propre copie à compléter.' },
					{ type: 'nouveau', text: 'Code de classe : invitez vos élèves à rejoindre une classe avec un simple code à partager.' },
					{ type: 'amelio', text: 'Liste des élèves de la classe avec leur statut (a rejoint / invité).' },
				],
			},
			{
				version: 'v0.1 beta',
				date: '11 mai 2026',
				title: 'La beta de Classroom est disponible',
				changes: [
					{ type: 'refonte', text: 'Classroom rejoint JacSuite en beta — l’espace de cours pour distribuer et corriger des documents en classe.' },
					{ type: 'nouveau', text: 'Créez des classes, donnez-leur un nom, une matière et une couleur.' },
					{ type: 'nouveau', text: 'Tableau de bord par classe : retrouvez vos classes et entrez dans chacune depuis l’accueil Classroom.' },
					{ type: 'nouveau', text: 'Accueil dédié dans son propre onglet JacSuite, avec badge Beta dans le launcher et le menu Applications.' },
					{ type: 'bientot', text: 'Devoirs, remises des élèves et correction intégrée — à venir dans les prochaines mises à jour.' },
				],
			},
		],
	},
}

// ---------- Sucre syntaxique ----------

/**
 * Retourne la version courante (string SemVer) d'une app.
 */
export const getAppVersion = (appKey) => APP_CHANGELOGS[appKey]?.version || '0.0.0'

/**
 * Retourne la liste complète des entries de changelog d'une app.
 * La 1ʳᵉ entrée est par convention la « version actuelle ».
 */
export const getAppChangelog = (appKey) => APP_CHANGELOGS[appKey]?.entries || []

/**
 * Retourne la dernière entrée (= notes de version courantes).
 */
export const getLatestChangelogEntry = (appKey) => APP_CHANGELOGS[appKey]?.entries?.[0] || null

/**
 * Date de publication initiale = date de l'entrée la PLUS ANCIENNE ayant une
 * vraie date (on saute les entrées « bientôt » dont la date vaut '—').
 * Renvoie la string telle quelle (ex. '14 février 2026') ou null.
 */
export const getAppPublishedDate = (appKey) => {
	const entries = APP_CHANGELOGS[appKey]?.entries
	if (!entries?.length) return null
	for (let i = entries.length - 1; i >= 0; i--) {
		const d = entries[i].date
		if (d && d !== '—') return d
	}
	return null
}

/**
 * Date de dernière mise à jour = date de l'entrée la PLUS RÉCENTE ayant une
 * vraie date. Renvoie la string telle quelle ou null.
 */
export const getAppLastUpdated = (appKey) => {
	const entries = APP_CHANGELOGS[appKey]?.entries
	if (!entries?.length) return null
	for (let i = 0; i < entries.length; i++) {
		const d = entries[i].date
		if (d && d !== '—') return d
	}
	return null
}

// ---------- Mapping appName (display) → clé de changelog ----------

/**
 * Map des noms d'affichage (utilisés par VersionModal via la prop appName)
 * vers les clés de APP_CHANGELOGS. Permet aux composants existants de continuer
 * à passer 'JacPDF', 'JacTâche', etc.
 */
export const APP_NAME_TO_KEY = {
	JacSuite: 'jacsuite',
	JacCloud: 'jaccloud',
	'JacSuite Cloud': 'jaccloud',
	JacPDF: 'jacpdf',
	JacDoc: 'jacdoc',
	JacNote: 'jacnote',
	'JacTâche': 'jactache',
	JacCalendrier: 'jaccalendrier',
	JacSlide: 'jacslide',
	JacPaint: 'jacpaint',
	Classe: 'classroom',
	Classroom: 'classroom',
	'JacSuite Classroom': 'classroom',
}

/**
 * Helper de résolution : passe-moi un display name ou une clé interne,
 * je te renvoie le changelog complet (ou null).
 */
export const getChangelogByAppName = (appName) => {
	const key = APP_NAME_TO_KEY[appName] || appName?.toLowerCase()
	return APP_CHANGELOGS[key] || null
}