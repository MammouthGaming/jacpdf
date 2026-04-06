import './ComingSoonModal.css'

function GoogleDriveIcon() {
  return (
    <svg width="52" height="52" viewBox="0 0 122.88 109.79" xmlns="http://www.w3.org/2000/svg">
      <path fill="#1967D2" d="M9.29,94.1l5.42,9.36c1.13,1.97,2.74,3.52,4.65,4.64l19.35-33.5H0c0,2.18,0.56,4.36,1.69,6.33L9.29,94.1z"/>
      <path fill="#34A853" d="M61.44,35.19L42.09,1.69c-1.9,1.13-3.52,2.67-4.65,4.65L1.69,68.27C0.59,70.19,0,72.38,0,74.6l38.71,0L61.44,35.19z"/>
      <path fill="#EA4335" d="M103.53,108.1c1.9-1.13,3.52-2.67,4.65-4.64l2.25-3.87l10.77-18.65c1.13-1.97,1.69-4.15,1.69-6.33H84.17l8.24,16.19L103.53,108.1z"/>
      <path fill="#188038" d="M61.44,35.19l19.35-33.5C78.89,0.56,76.71,0,74.46,0H48.42c-2.25,0-4.43,0.63-6.33,1.69L61.44,35.19z"/>
      <path fill="#4285F4" d="M84.17,74.6H38.71l-19.35,33.5c1.9,1.13,4.08,1.69,6.33,1.69h71.5c2.25,0,4.44-0.63,6.33-1.69L84.17,74.6z"/>
      <path fill="#FBBC04" d="M103.31,37.3L85.44,6.33c-1.13-1.97-2.74-3.52-4.64-4.65l-19.35,33.5L84.17,74.6h38.64c0-2.18-0.56-4.36-1.69-6.33L103.31,37.3z"/>
    </svg>
  )
}

function OneDriveIcon() {
  return (
    <svg width="64" height="44" viewBox="35.98 139.2 648.03 430.85" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="od-r0" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(130.864814,156.804864,-260.089994,217.063603,48.669602,228.766494)">
          <stop offset="0" stopColor="rgb(28.235294%,58.039216%,99.607843%)"/>
          <stop offset="0.695072" stopColor="rgb(3.529412%,20.392157%,70.196078%)"/>
        </radialGradient>
        <radialGradient id="od-r1" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(-575.289668,663.594003,-491.728488,-426.294267,596.956501,-6.380235)">
          <stop offset="0.165327" stopColor="rgb(13.72549%,75.294118%,99.607843%)"/>
          <stop offset="0.534" stopColor="rgb(10.980392%,56.862745%,100%)"/>
        </radialGradient>
        <linearGradient id="od-l0" gradientUnits="userSpaceOnUse" x1="29.9997" y1="37.9823" x2="29.9997" y2="18.3982" gradientTransform="matrix(15,0,0,15,0,0)">
          <stop offset="0" stopColor="rgb(0%,52.54902%,100%)"/>
          <stop offset="0.49" stopColor="rgb(0%,73.333333%,100%)"/>
        </linearGradient>
      </defs>
      <path fill="url(#od-r0)" d="M215.078125 205.089844C116.011719 205.09375 41.957031 286.1875 36.382812 376.527344C39.835938 395.992188 51.175781 434.429688 68.941406 432.457031C91.144531 429.988281 147.066406 432.457031 194.765625 346.105469C229.609375 283.027344 301.285156 205.085938 215.078125 205.089844Z"/>
      <path fill="url(#od-r1)" d="M192.171875 238.8125C158.871094 291.535156 114.042969 367.085938 98.914062 390.859375C80.929688 419.121094 33.304688 407.113281 37.25 366.609375C36.863281 369.894531 36.5625 373.210938 36.355469 376.546875C29.84375 481.933594 113.398438 569.453125 217.375 569.453125C331.96875 569.453125 605.269531 426.671875 577.609375 283.609375C548.457031 199.519531 466.523438 139.203125 373.664062 139.203125C280.808594 139.203125 221.296875 192.699219 192.171875 238.8125Z"/>
      <path fill="url(#od-l0)" d="M215.699219 569.496094C215.699219 569.496094 489.320312 570.035156 535.734375 570.035156C619.960938 570.035156 684 501.273438 684 421.03125C684 340.789062 618.671875 272.445312 535.734375 272.445312C452.792969 272.445312 405.027344 334.492188 369.152344 402.226562C327.117188 481.59375 273.488281 568.546875 215.699219 569.496094Z"/>
    </svg>
  )
}

export default function ComingSoonModal({ title, onClose }) {
  return (
    <div className="csm-overlay" onClick={onClose}>
      <div className="csm-card" onClick={(e) => e.stopPropagation()}>
        <div className="csm-icon">
          {title === 'Google Drive' ? <GoogleDriveIcon /> : <OneDriveIcon />}
        </div>
        <h2 className="csm-title">{title}</h2>
        <p className="csm-text">L'intégration {title} arrive bientôt !</p>
        <button className="csm-btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}