import React, { useEffect, useState } from 'react';

type Props = React.ImgHTMLAttributes<HTMLImageElement>;

const initials = (s: string) =>
  s
    .replace(/photo/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('');

/**
 * <img> that never shows the browser's broken-image icon + alt text.
 *  - no-referrer: hot-link protected hosts still load on desktop browsers
 *  - one retry with a cache-buster (a failed response cached by the desktop browser)
 *  - still failing / no src: initials box with the same classes (size + rounding kept)
 */
export const SafeImg: React.FC<Props> = ({ src, alt = '', className = '', onError, ...rest }) => {
  const [tries, setTries] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setTries(0);
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    const isProof = /photo/i.test(alt);
    return (
      <div
        title={alt}
        className={`${className} flex items-center justify-center bg-slate-700 text-slate-200 font-bold text-[10px] overflow-hidden select-none`}
      >
        {isProof ? 'No image' : initials(alt) || '?'}
      </div>
    );
  }

  const url = tries > 0 && !src.startsWith('data:') && !src.startsWith('blob:') ? `${src}${src.includes('?') ? '&' : '?'}r=${tries}` : src;

  return (
    <img
      {...rest}
      src={url}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={e => {
        if (tries < 1 && !src.startsWith('data:') && !src.startsWith('blob:')) setTries(1);
        else setFailed(true);
        onError?.(e);
      }}
    />
  );
};
