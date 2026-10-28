import type { CSSProperties } from 'react'

/**
 * CaterFlex loading animation: the chef-hat "C" walking in place.
 * Sprites live in /public/loader/ (body.png, leg-left.png, leg-right.png).
 * Colour follows the surrounding text colour, e.g. className="text-[#8E1F2C]".
 */
export function WalkingLoader({
  height = 200,
  label = 'Loading',
  showLabel = true,
  className = 'text-[#8E1F2C]',
}: {
  height?: number
  label?: string
  showLabel?: boolean
  className?: string
}) {
  const width = Math.round((height * 387) / 657)
  const sprite = (file: string): CSSProperties => ({
    WebkitMaskImage: `url(/loader/${file})`,
    maskImage: `url(/loader/${file})`,
  })

  return (
    <div role="status" aria-live="polite" className={`inline-flex flex-col items-center ${className}`}>
      <div className="wl-stage" style={{ width, height }} aria-hidden="true">
        <div className="wl-shadow" />
        <div className="wl-bob">
          <div className="wl-layer wl-leg wl-leg-a" style={sprite('leg-left.png')} />
          <div className="wl-layer wl-leg wl-leg-b" style={sprite('leg-right.png')} />
          <div className="wl-layer" style={sprite('body.png')} />
        </div>
      </div>
      <span className={showLabel ? 'mt-5 font-heading text-2xl font-bold uppercase tracking-wide' : 'sr-only'}>
        {label}
        <span className="wl-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
      </span>
      <style>{`
        .wl-stage{position:relative}
        .wl-bob{position:absolute;inset:0;transform-origin:50% 100%;animation:wl-bob .9s ease-in-out infinite}
        .wl-layer{position:absolute;inset:0;background-color:currentColor;
          -webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
        .wl-leg-a{transform-origin:36% 78.6%;animation:wl-step .9s ease-in-out infinite}
        .wl-leg-b{transform-origin:51.3% 79.8%;animation:wl-step .9s ease-in-out infinite;animation-delay:-.45s}
        .wl-shadow{position:absolute;left:12%;right:12%;bottom:-3%;height:5%;border-radius:50%;
          background:currentColor;opacity:.15;animation:wl-shadow .45s ease-in-out infinite}
        @keyframes wl-step{
          0%{transform:rotate(20deg) translateY(0)}
          25%{transform:rotate(0deg) translateY(-3%)}
          50%{transform:rotate(-20deg) translateY(0)}
          75%{transform:rotate(0deg) translateY(0)}
          100%{transform:rotate(20deg) translateY(0)}
        }
        @keyframes wl-bob{
          0%,100%{transform:translateY(0) rotate(-1.5deg)}
          25%{transform:translateY(-2.2%) rotate(0deg)}
          50%{transform:translateY(0) rotate(1.5deg)}
          75%{transform:translateY(-2.2%) rotate(0deg)}
        }
        .wl-dots i{font-style:normal;animation:wl-dot 1.2s infinite;opacity:.2}
        .wl-dots i:nth-child(2){animation-delay:.2s}
        .wl-dots i:nth-child(3){animation-delay:.4s}
        @keyframes wl-dot{0%,60%,100%{opacity:.2}30%{opacity:1}}
        @keyframes wl-shadow{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.88)}}
        @media (prefers-reduced-motion:reduce){
          .wl-bob,.wl-leg,.wl-shadow,.wl-dots i{animation:none}
          .wl-bob{animation:wl-pulse 1.6s ease-in-out infinite}
          @keyframes wl-pulse{0%,100%{opacity:1}50%{opacity:.55}}
        }
      `}</style>
    </div>
  )
}