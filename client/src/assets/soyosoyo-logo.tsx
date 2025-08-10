// SOYOSOYO SACCO Logo Component based on the provided image
export const SoyosoyoLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Outer circle - light green */}
    <circle cx="100" cy="100" r="95" fill="#7dd3c0" stroke="white" strokeWidth="2"/>
    
    {/* Inner circle - dark teal */}
    <circle cx="100" cy="100" r="75" fill="#1e7b85" stroke="white" strokeWidth="3"/>
    
    {/* Shield background */}
    <path d="M100 40 L100 40 C120 45, 130 55, 130 75 L130 125 C130 145, 120 155, 100 160 C80 155, 70 145, 70 125 L70 75 C70 55, 80 45, 100 40 Z" fill="white"/>
    
    {/* Inner shield outline */}
    <path d="M100 50 L100 50 C115 54, 122 62, 122 78 L122 120 C122 136, 115 144, 100 148 C85 144, 78 136, 78 120 L78 78 C78 62, 85 54, 100 50 Z" fill="none" stroke="#7dd3c0" strokeWidth="2"/>
    
    {/* SACCO text in shield */}
    <text x="100" y="85" textAnchor="middle" fill="#1e7b85" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">SACCO</text>
    
    {/* Medical cross */}
    <g transform="translate(130, 70)">
      <circle cx="0" cy="0" r="12" fill="#1e7b85"/>
      <path d="M-6 -2 L6 -2 L6 2 L-6 2 Z" fill="white"/>
      <path d="M-2 -6 L2 -6 L2 6 L-2 6 Z" fill="white"/>
    </g>
    
    {/* Top curved text - SOYOSOYO MEDICARE */}
    <path id="topCurve" d="M 30 100 A 70 70 0 0 1 170 100" fill="none"/>
    <text fontSize="14" fontWeight="bold" fill="#1e7b85" fontFamily="Arial, sans-serif">
      <textPath href="#topCurve" startOffset="50%" textAnchor="middle">
        SOYOSOYO MEDICARE
      </textPath>
    </text>
    
    {/* Bottom text */}
    <text x="100" y="175" textAnchor="middle" fill="#1e7b85" fontSize="12" fontWeight="bold" fontFamily="Arial, sans-serif">CO-OPERATIVE SAVINGS &amp;</text>
    <text x="100" y="190" textAnchor="middle" fill="#7dd3c0" fontSize="12" fontWeight="bold" fontFamily="Arial, sans-serif">CREDIT SOCIETY</text>
  </svg>
);