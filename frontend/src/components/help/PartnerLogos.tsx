import ardcLogo from '@/assets/partners/ardc.svg';
import ncrisLogo from '@/assets/partners/ausgov-ncris.png';
import sihLogo from '@/assets/partners/sih-usyd.png';
import sydneyCorpusLabLogo from '@/assets/partners/sydney-corpus-lab.png';
import ldacaLogo from '../../logo.png';

interface PartnerLogo {
  src: string;
  alt: string;
  href: string;
  /** Heights follow the workshop slides so the marks look the same size. */
  className: string;
}

const FUNDERS: readonly PartnerLogo[] = [
  {
    src: ldacaLogo,
    alt: 'LDaCA, Language Data Commons of Australia',
    href: 'https://www.ldaca.edu.au/',
    className: 'h-7',
  },
  {
    src: ardcLogo,
    alt: 'ARDC, Australian Research Data Commons',
    href: 'https://ardc.edu.au/',
    className: 'h-7',
  },
  {
    src: ncrisLogo,
    alt: 'Australian Government, NCRIS, National Research Infrastructure for Australia',
    href: 'https://www.education.gov.au/ncris',
    className: 'h-7',
  },
];

const DEVELOPERS: readonly PartnerLogo[] = [
  {
    src: sydneyCorpusLabLogo,
    alt: 'Sydney Corpus Lab',
    href: 'https://sydneycorpuslab.com/',
    className: 'h-7',
  },
  {
    src: sihLogo,
    alt: 'The University of Sydney, Sydney Informatics Hub',
    href: 'https://informatics.sydney.edu.au/',
    className: 'h-8',
  },
];

const LogoLink = ({ logo }: { logo: PartnerLogo }) => (
  <a
    href={logo.href}
    target="_blank"
    rel="noreferrer"
    title={`${logo.alt} (opens in a new tab)`}
    className="block shrink-0 rounded-sm leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
  >
    <img src={logo.src} alt={logo.alt} className={`${logo.className} w-auto object-contain`} />
  </a>
);

/**
 * LDaCA and its funders, then the teams that build Wordflow, each linked to
 * its home page, as on the workshop slides. The strip keeps a light ground in
 * every theme because the marks are drawn for light backgrounds.
 */
export function PartnerLogos() {
  return (
    <div
      data-testid="partner-logos"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-full border border-surface-border bg-[#fdfcf8] px-4 py-1.5"
    >
      {FUNDERS.map((logo) => (
        <LogoLink key={logo.href} logo={logo} />
      ))}
      <span aria-hidden="true" className="h-7 w-px bg-[#d9d6cc]" />
      {DEVELOPERS.map((logo) => (
        <LogoLink key={logo.href} logo={logo} />
      ))}
    </div>
  );
}
