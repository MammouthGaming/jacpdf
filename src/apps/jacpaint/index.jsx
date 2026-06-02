// JacPaint/index.jsx — point d'entrée stable de l'app JacPaint.
// Le vrai composant racine est dans pages/home/HomeContent.jsx ; on ne fait
// que ré-exporter pour ne pas casser les imports historiques.

import HomeContent from './pages/home/HomeContent'

export default function JacPaintApp(props) {
	return <HomeContent {...props} />
}