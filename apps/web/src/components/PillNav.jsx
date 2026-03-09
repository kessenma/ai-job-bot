import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'motion/react';

function Pill({ item, isActive, isRouterLink }) {
  const [hovered, setHovered] = useState(false);

  const content = (
    <>
      {/* Circle that rises from below on hover */}
      <AnimatePresence>
        {hovered && (
          <motion.span
            className="absolute inset-0 rounded-full z-[1] pointer-events-none"
            style={{ background: 'var(--base, #000)' }}
            initial={{ clipPath: 'circle(0% at 50% 100%)' }}
            animate={{ clipPath: 'circle(120% at 50% 100%)' }}
            exit={{ clipPath: 'circle(0% at 50% 100%)' }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          />
        )}
      </AnimatePresence>

      {/* Default label */}
      <motion.span
        className="relative z-[2] pointer-events-none"
        animate={{ y: hovered ? -30 : 0, opacity: hovered ? 0 : 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      >
        {item.label}
      </motion.span>

      {/* Hover label (slides up into view) */}
      <motion.span
        className="absolute inset-0 flex items-center justify-center z-[3] pointer-events-none"
        style={{ color: 'var(--hover-text, #fff)' }}
        animate={{ y: hovered ? 0 : 30, opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        aria-hidden="true"
      >
        {item.label}
      </motion.span>

      {/* Active dot */}
      {isActive && (
        <span
          className="absolute left-1/2 -bottom-[6px] -translate-x-1/2 w-3 h-3 rounded-full z-[4]"
          style={{ background: 'var(--base, #000)' }}
          aria-hidden="true"
        />
      )}
    </>
  );

  const pillClasses =
    'relative overflow-hidden inline-flex items-center justify-center h-full no-underline rounded-full box-border font-semibold text-[16px] leading-[0] uppercase tracking-[0.2px] whitespace-nowrap cursor-pointer';

  const pillStyle = {
    background: 'var(--pill-bg, #fff)',
    color: 'var(--pill-text, var(--base, #000))',
    paddingLeft: 'var(--pill-pad-x)',
    paddingRight: 'var(--pill-pad-x)',
  };

  const hoverProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  if (isRouterLink) {
    return (
      <Link
        role="menuitem"
        to={item.href}
        className={pillClasses}
        style={pillStyle}
        aria-label={item.ariaLabel || item.label}
        {...hoverProps}
      >
        {content}
      </Link>
    );
  }

  return (
    <a
      role="menuitem"
      href={item.href}
      className={pillClasses}
      style={pillStyle}
      aria-label={item.ariaLabel || item.label}
      {...hoverProps}
    >
      {content}
    </a>
  );
}

const PillNav = ({
  logo,
  logoAlt = 'Logo',
  items,
  activeHref,
  className = '',
  baseColor = '#fff',
  pillColor = '#060010',
  hoveredPillTextColor = '#060010',
  pillTextColor,
  onMobileMenuClick,
  initialLoadAnimation = true,
}) => {
  const resolvedPillTextColor = pillTextColor ?? baseColor;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isExternalLink = (href) =>
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('//') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('#');

  const isRouterLink = (href) => href && !isExternalLink(href);

  const cssVars = {
    '--base': baseColor,
    '--pill-bg': pillColor,
    '--hover-text': hoveredPillTextColor,
    '--pill-text': resolvedPillTextColor,
    '--nav-h': '42px',
    '--logo': '36px',
    '--pill-pad-x': '18px',
    '--pill-gap': '3px',
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
    onMobileMenuClick?.();
  };

  const LogoWrapper = isRouterLink(items?.[0]?.href) ? Link : 'a';
  const logoLinkProps = isRouterLink(items?.[0]?.href)
    ? { to: items[0].href }
    : { href: items?.[0]?.href || '#' };

  return (
    <div className="absolute top-[1em] z-[1000] w-full left-0 md:w-auto md:left-auto">
      <nav
        className={`w-full md:w-max flex items-center justify-between md:justify-start box-border px-4 md:px-0 ${className}`}
        aria-label="Primary"
        style={cssVars}
      >
        {/* Logo */}
        <motion.div
          initial={initialLoadAnimation ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <LogoWrapper
            {...logoLinkProps}
            aria-label="Home"
            className="rounded-full p-2 inline-flex items-center justify-center overflow-hidden"
            style={{
              width: 'var(--nav-h)',
              height: 'var(--nav-h)',
              background: 'var(--base, #000)',
            }}
          >
            <motion.img
              src={logo}
              alt={logoAlt}
              className="w-full h-full object-cover block"
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.3 }}
            />
          </LogoWrapper>
        </motion.div>

        {/* Desktop nav pills */}
        <motion.div
          className="relative items-center rounded-full hidden md:flex ml-2"
          style={{
            height: 'var(--nav-h)',
            background: 'var(--base, #000)',
          }}
          initial={initialLoadAnimation ? { width: 0, overflow: 'hidden' } : false}
          animate={{ width: 'auto' }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <ul
            role="menubar"
            className="list-none flex items-stretch m-0 p-[3px] h-full"
            style={{ gap: 'var(--pill-gap)' }}
          >
            {items.map((item) => (
              <li key={item.href} role="none" className="flex h-full">
                <Pill
                  item={item}
                  isActive={activeHref === item.href}
                  isRouterLink={isRouterLink(item.href)}
                />
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Mobile hamburger */}
        <button
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
          className="md:hidden rounded-full border-0 flex flex-col items-center justify-center gap-1 cursor-pointer p-0 relative"
          style={{
            width: 'var(--nav-h)',
            height: 'var(--nav-h)',
            background: 'var(--base, #000)',
          }}
        >
          <motion.span
            className="w-4 h-0.5 rounded origin-center block"
            style={{ background: 'var(--pill-bg, #fff)' }}
            animate={{ rotate: isMobileMenuOpen ? 45 : 0, y: isMobileMenuOpen ? 3 : 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.span
            className="w-4 h-0.5 rounded origin-center block"
            style={{ background: 'var(--pill-bg, #fff)' }}
            animate={{ rotate: isMobileMenuOpen ? -45 : 0, y: isMobileMenuOpen ? -3 : 0 }}
            transition={{ duration: 0.3 }}
          />
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="md:hidden absolute top-[3em] left-4 right-4 rounded-[27px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-[998] origin-top"
            style={{ ...cssVars, background: 'var(--base, #f0f0f0)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <ul className="list-none m-0 p-[3px] flex flex-col gap-[3px]">
              {items.map((item) => {
                const linkClasses =
                  'block py-3 px-4 text-[16px] font-medium rounded-[50px] transition-colors duration-200';

                const style = {
                  background: 'var(--pill-bg, #fff)',
                  color: 'var(--pill-text, #fff)',
                };

                const hoverIn = (e) => {
                  e.currentTarget.style.background = 'var(--base)';
                  e.currentTarget.style.color = 'var(--hover-text, #fff)';
                };
                const hoverOut = (e) => {
                  e.currentTarget.style.background = 'var(--pill-bg, #fff)';
                  e.currentTarget.style.color = 'var(--pill-text, #fff)';
                };

                return (
                  <li key={item.href}>
                    {isRouterLink(item.href) ? (
                      <Link
                        to={item.href}
                        className={linkClasses}
                        style={style}
                        onMouseEnter={hoverIn}
                        onMouseLeave={hoverOut}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <a
                        href={item.href}
                        className={linkClasses}
                        style={style}
                        onMouseEnter={hoverIn}
                        onMouseLeave={hoverOut}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.label}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PillNav;
