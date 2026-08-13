function CodexLogo() {
  return (
    <span aria-label="Codex" className="partner-wordmark codex-wordmark">
      <strong>Codex</strong>
    </span>
  );
}

function ConvokeLogo() {
  return (
    <span aria-label="Convoke" className="partner-wordmark convoke-wordmark">
      <svg aria-hidden="true" viewBox="0 0 54 26">
        <path d="M1 18C5.8 8.8 15.2 2.7 26.1 2.2h2c10.9.5 20.3 6.6 25.1 15.8" />
        <path d="M5.2 21c4.2-7.5 12.4-12.4 21.8-12.4S44.6 13.5 48.8 21" />
        <path d="M15.5 23.2c2.9-3.2 7-5.1 11.5-5.1s8.6 1.9 11.5 5.1" />
      </svg>
      <strong>convoke</strong>
    </span>
  );
}

function AwsLogo() {
  return (
    <span
      aria-label="Amazon Web Services"
      className="partner-wordmark aws-wordmark"
    >
      <svg aria-hidden="true" viewBox="0 0 84 39">
        <text x="4" y="25">
          aws
        </text>
        <path className="aws-smile" d="M10 30.5c17 8 40.4 8.9 61-1.2" />
        <path className="aws-arrow" d="m65.8 27.7 5.9 1.6-2.3 5.5" />
      </svg>
    </span>
  );
}

const partners = [
  {
    href: "https://openai.com/codex/",
    label: "Learn about Codex",
    logo: <CodexLogo />,
  },
  {
    href: "https://www.convoke.bio/platform",
    label: "Visit the Convoke platform",
    logo: <ConvokeLogo />,
  },
  {
    href: "https://aws.amazon.com/",
    label: "Visit AWS",
    logo: <AwsLogo />,
  },
];

export function BrandLogoStrip() {
  return (
    <section className="brand-logo-strip" aria-label="Demo technology partners">
      <div className="brand-logo-inner">
        <span className="brand-logo-label">Built with</span>
        <div className="brand-logo-list">
          {partners.map((partner) => (
            <a
              aria-label={partner.label}
              href={partner.href}
              key={partner.href}
              rel="noreferrer"
              target="_blank"
            >
              {partner.logo}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
