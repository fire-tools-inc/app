import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './PolicyModal.css';

export type PolicyType = 'privacy' | 'cookie';

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyType: PolicyType;
  onSwitchPolicy?: (type: PolicyType) => void;
}

export function PolicyModal({ isOpen, onClose, policyType, onSwitchPolicy }: PolicyModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and escape key handling
  useEffect(() => {
    if (!isOpen) return;

    // Focus the close button when modal opens
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSwitchPolicy = (type: PolicyType) => {
    if (onSwitchPolicy) {
      onSwitchPolicy(type);
    }
  };

  return (
    <div
      className="policy-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-modal-title"
    >
      <div 
        className="policy-modal-content" 
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="policy-modal-header">
          <h1 id="policy-modal-title">
            {policyType === 'privacy' ? t('legal.privacyPolicy') : t('legal.cookiePolicy')}
          </h1>
          <button
            ref={closeButtonRef}
            className="policy-modal-close"
            onClick={onClose}
            aria-label={t('legal.closePolicyModal')}
          >
            ×
          </button>
        </div>
        <div className="policy-modal-body">
          {policyType === 'privacy' 
            ? <PrivacyPolicyContent onSwitchToCookie={() => handleSwitchPolicy('cookie')} /> 
            : <CookiePolicyContent onSwitchToPrivacy={() => handleSwitchPolicy('privacy')} />
          }
        </div>
      </div>
    </div>
  );
}

interface PrivacyPolicyContentProps {
  onSwitchToCookie?: () => void;
}

function PrivacyPolicyContent({ onSwitchToCookie }: PrivacyPolicyContentProps) {
  const { t } = useTranslation();

  return (
    <>
      <p className="last-updated">
        <strong>{t('legal.lastUpdated')}:</strong> December 31, 2025
      </p>
      <p className="policy-language-note">{t('legal.contentEnglishOnly')}</p>

      {/* TODO(i18n): translate legal text content in a future revision */}

      <section className="policy-section">
        <h2>1. Introduction</h2>
        <p>
          Fire Tools ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we handle your personal and financial data when you use our Financial Independence Retire Early (FIRE) planning tools.
        </p>
        <p>
          <strong>Core Privacy Principle:</strong> Fire Tools is a client-side only application. All your data stays on your device. We do not collect, transmit, or store any of your data on our servers because we don't have any servers.
        </p>
      </section>

      <section className="policy-section">
        <h2>2. Data Controller</h2>
        <p>
          Fire Tools is an open-source project maintained by the community. For privacy inquiries, please contact:
        </p>
        <p>
          <strong>Email:</strong> security@mb-consulting.dev
        </p>
      </section>

      <section className="policy-section">
        <h2>3. Information We Collect and How We Use It</h2>
        
        <h3>3.1 Information You Provide</h3>
        <p>
          You may provide the following financial and personal information when using Fire Tools:
        </p>
        <ul>
          <li>Financial data (savings, income, expenses, asset allocation)</li>
          <li>Personal information (year of birth, retirement age)</li>
          <li>Account name or nickname (optional, for personalization)</li>
          <li>Calculator settings and preferences</li>
        </ul>
        <p>
          <strong>How We Use It:</strong> All data you provide is processed entirely in your web browser to calculate your FIRE projections, run Monte Carlo simulations, and manage your asset allocation. This data never leaves your device.
        </p>

        <h3>3.2 Information Collected Automatically</h3>
        <p>
          <strong>We collect nothing automatically.</strong> We do not use analytics, tracking pixels, or any form of automated data collection. No information about your device, IP address, location, or browsing behavior is collected or transmitted.
        </p>

        <h3>3.3 Information from Third Parties</h3>
        <p>
          <strong>None.</strong> Fire Tools does not integrate with any third-party services that collect data. We do not use social login, authentication providers, payment processors, or any external APIs.
        </p>
      </section>

      <section className="policy-section">
        <h2>4. Legal Basis for Processing (GDPR)</h2>
        <table className="policy-table">
          <thead>
            <tr>
              <th>Purpose</th>
              <th>Legal Basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Store calculator inputs and settings locally</td>
              <td>Legitimate interest (providing the service)</td>
            </tr>
            <tr>
              <td>Encrypt sensitive financial data</td>
              <td>Legitimate interest (data security)</td>
            </tr>
            <tr>
              <td>Remember user preferences</td>
              <td>Legitimate interest (user experience)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="policy-section">
        <h2>5. Cookies and Local Storage</h2>
        <p>
          Fire Tools uses strictly necessary cookies to store your financial data and settings locally on your device. These cookies are essential for the application to function and do not require consent under GDPR.
        </p>
        <p>
          For detailed information about cookies we use, please see our{' '}
          <button type="button" className="policy-inline-link" onClick={onSwitchToCookie}>
            {t('legal.switchToCookiePolicy')}
          </button>.
        </p>
        <p>
          <strong>We do NOT use:</strong>
        </p>
        <ul>
          <li>Analytics cookies</li>
          <li>Advertising or marketing cookies</li>
          <li>Social media cookies</li>
          <li>Tracking pixels or beacons</li>
          <li>Third-party cookies of any kind</li>
        </ul>
      </section>

      <section className="policy-section">
        <h2>6. Data Sharing and Third Parties</h2>
        <p>
          <strong>We do NOT share your data with anyone.</strong> Since your data never leaves your device, there is no data to share. We do not:
        </p>
        <ul>
          <li>Sell your personal data</li>
          <li>Share data with service providers (we have none)</li>
          <li>Send data to analytics companies</li>
          <li>Transmit data to advertising networks</li>
          <li>Share data with business partners</li>
          <li>Disclose data to legal authorities (we don't have access to it)</li>
        </ul>
      </section>

      <section className="policy-section">
        <h2>7. International Data Transfers</h2>
        <p>
          <strong>Not applicable.</strong> Your data remains on your device and is never transferred anywhere, domestically or internationally.
        </p>
      </section>

      <section className="policy-section">
        <h2>8. Data Retention</h2>
        <table className="policy-table">
          <thead>
            <tr>
              <th>Data Type</th>
              <th>Retention Period</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Calculator inputs and settings</td>
              <td>Stored in cookies for 365 days, or until you clear your browser data</td>
            </tr>
            <tr>
              <td>Asset allocation data</td>
              <td>Stored in cookies for 365 days, or until you clear your browser data</td>
            </tr>
            <tr>
              <td>User preferences</td>
              <td>Stored in cookies for 365 days, or until you clear your browser data</td>
            </tr>
          </tbody>
        </table>
        <p>
          You have complete control over your data. You can delete all stored data at any time using the "Reset All Data" option in the Settings page or by clearing your browser cookies.
        </p>
      </section>

      <section className="policy-section">
        <h2>9. Your Rights (GDPR & Privacy Laws)</h2>
        <p>
          Under GDPR and other privacy laws, you have the following rights:
        </p>
        <ul>
          <li><strong>Right to Access:</strong> All your data is accessible through the Fire Tools interface</li>
          <li><strong>Right to Rectification:</strong> You can edit your data at any time through the calculator inputs</li>
          <li><strong>Right to Erasure:</strong> Use the "Reset All Data" button or clear your browser cookies</li>
          <li><strong>Right to Restrict Processing:</strong> Stop using the application or delete your data</li>
          <li><strong>Right to Data Portability:</strong> Export your data as CSV files at any time</li>
          <li><strong>Right to Object:</strong> You can stop using the application at any time</li>
          <li><strong>Right to Withdraw Consent:</strong> Delete your data or stop using the application</li>
        </ul>
        <p>
          Since all data is stored locally on your device, you have direct control over your data without needing to contact us.
        </p>
      </section>

      <section className="policy-section">
        <h2>10. Security</h2>
        <p>
          We implement robust security measures to protect your data:
        </p>
        <ul>
          <li><strong>AES-256 Encryption:</strong> All sensitive financial data is encrypted before storage</li>
          <li><strong>HTTPS/TLS:</strong> The application is served over secure HTTPS connections</li>
          <li><strong>Secure Cookies:</strong> Cookies use <code>SameSite=Strict</code> and <code>Secure</code> flags</li>
          <li><strong>No Server Storage:</strong> Your data never reaches our servers (we don't have any)</li>
          <li><strong>No Network Transmission:</strong> Data is never sent over the network</li>
          <li><strong>Open Source:</strong> Full transparency - audit our code on GitHub</li>
        </ul>
        <p>
          <strong>Your Responsibility:</strong> Keep your device secure. Anyone with access to your device and browser can view your Fire Tools data.
        </p>
      </section>

      <section className="policy-section">
        <h2>11. Children's Privacy</h2>
        <p>
          Fire Tools is intended for adults planning their financial future. We do not knowingly collect data from children under 16. Since we don't collect any data, this is inherently protected.
        </p>
      </section>

      <section className="policy-section">
        <h2>12. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. When we make changes, we will update the "Last Updated" date at the top of this policy.
        </p>
        <p>
          Material changes will be announced through our GitHub repository. Continued use of Fire Tools after changes constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="policy-section">
        <h2>13. Contact Us</h2>
        <p>
          For questions, concerns, or requests related to this Privacy Policy:
        </p>
        <ul>
          <li><strong>Email:</strong> security@mb-consulting.dev</li>
          <li><strong>GitHub:</strong> <a href="https://github.com/mbianchidev/fire-tools" target="_blank" rel="noopener noreferrer">github.com/mbianchidev/fire-tools</a></li>
        </ul>
      </section>

      <section className="policy-section">
        <h2>14. Jurisdiction and Governing Law</h2>
        <p>
          This Privacy Policy is governed by applicable data protection laws including GDPR (EU), CCPA (California), and other relevant privacy regulations. Since we don't collect or store data, compliance is inherently maintained.
        </p>
      </section>
    </>
  );
}

interface CookiePolicyContentProps {
  onSwitchToPrivacy?: () => void;
}

function CookiePolicyContent({ onSwitchToPrivacy }: CookiePolicyContentProps) {
  const { t } = useTranslation();

  return (
    <>
      <p className="last-updated">
        <strong>{t('legal.lastUpdated')}:</strong> December 31, 2025
      </p>
      <p className="policy-language-note">{t('legal.contentEnglishOnly')}</p>

      {/* TODO(i18n): translate legal text content in a future revision */}

      <section className="policy-section">
        <h2>What Are Cookies?</h2>
        <p>
          Cookies are small text files stored on your device (computer, tablet, or smartphone) when you visit websites. They help websites remember information about your visit, making your experience more convenient and the site more useful.
        </p>
      </section>

      <section className="policy-section">
        <h2>How Fire Tools Uses Cookies</h2>
        <p>
          Fire Tools uses cookies exclusively for <strong>essential functionality</strong>. We use cookies to:
        </p>
        <ul>
          <li>Store your financial planning data locally on your device</li>
          <li>Remember your calculator inputs and settings</li>
          <li>Save your asset allocation preferences</li>
          <li>Maintain your application settings between visits</li>
          <li>Store your acknowledgment of this cookie notice</li>
        </ul>
        <p>
          <strong>What we DON'T do:</strong>
        </p>
        <ul>
          <li>❌ Track your behavior across websites</li>
          <li>❌ Use analytics or statistics cookies</li>
          <li>❌ Serve advertisements or marketing cookies</li>
          <li>❌ Share your data with third parties</li>
          <li>❌ Use cookies for any non-essential purpose</li>
        </ul>
      </section>

      <section className="policy-section">
        <h2>Cookies We Use</h2>
        
        <h3>Strictly Necessary Cookies</h3>
        <p>
          These cookies are essential for Fire Tools to function. They cannot be disabled as the application would not work without them. Under GDPR and ePrivacy regulations, consent is not required for strictly necessary cookies.
        </p>
        
        <div className="cookie-table-wrapper">
          <table className="cookie-table">
            <thead>
              <tr>
                <th>Cookie Name</th>
                <th>Purpose</th>
                <th>Duration</th>
                <th>Data Stored</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>fire-calculator-inputs</code></td>
                <td>Stores your FIRE calculator inputs (savings, income, expenses, retirement age, etc.)</td>
                <td>365 days</td>
                <td>Encrypted financial planning data</td>
              </tr>
              <tr>
                <td><code>fire-calculator-asset-allocation</code></td>
                <td>Stores your asset allocation data (stocks, bonds, real estate, etc.)</td>
                <td>365 days</td>
                <td>Encrypted portfolio allocation data</td>
              </tr>
              <tr>
                <td><code>fire-calculator-asset-class-targets</code></td>
                <td>Stores your target allocation percentages for each asset class</td>
                <td>365 days</td>
                <td>Encrypted target allocation settings</td>
              </tr>
              <tr>
                <td><code>fire-calculator-settings</code></td>
                <td>Stores your application preferences (account name, currency, display settings)</td>
                <td>365 days</td>
                <td>Encrypted user preferences</td>
              </tr>
              <tr>
                <td><code>fire-tools-cookie-consent</code></td>
                <td>Remembers that you've acknowledged our cookie notice</td>
                <td>365 days</td>
                <td>Acknowledgment timestamp</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="info-box">
          <h4>Privacy & Security</h4>
          <p>
            All financial data stored in cookies is encrypted using AES-256 encryption before being saved. This ensures that even if someone gains access to your cookies, they cannot read your sensitive financial information without the encryption key.
          </p>
        </div>
      </section>

      <section className="policy-section">
        <h2>Third-Party Cookies</h2>
        <p>
          <strong>Fire Tools does not use any third-party cookies.</strong>
        </p>
        <p>
          We do not integrate with:
        </p>
        <ul>
          <li>Google Analytics or any analytics service</li>
          <li>Facebook Pixel or social media trackers</li>
          <li>Advertising networks</li>
          <li>Marketing platforms</li>
          <li>Third-party authentication services</li>
          <li>Payment processors</li>
        </ul>
        <p>
          All cookies are first-party cookies set by Fire Tools itself, solely for the purpose of making the application work.
        </p>
      </section>

      <section className="policy-section">
        <h2>How to Manage Cookies</h2>
        
        <h3>Within Fire Tools</h3>
        <p>
          You have complete control over your data within the application:
        </p>
        <ul>
          <li><strong>View Your Data:</strong> All your data is visible in the calculator and asset allocation pages</li>
          <li><strong>Edit Your Data:</strong> Change any input at any time</li>
          <li><strong>Export Your Data:</strong> Download your data as CSV files for backup</li>
          <li><strong>Delete Your Data:</strong> Use the "Reset All Data" button in Settings to clear all cookies</li>
        </ul>

        <h3>Browser Settings</h3>
        <p>
          You can control cookies through your browser settings. However, <strong>disabling cookies will prevent Fire Tools from functioning</strong>, as they are essential for the application to save and retrieve your data.
        </p>
        <p>
          Learn how to manage cookies in different browsers:
        </p>
        <ul>
          <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
          <li><a href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
          <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
          <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
        </ul>
      </section>

      <section className="policy-section">
        <h2>Cookie Consent</h2>
        <p>
          Since Fire Tools only uses strictly necessary cookies (essential for the website to function), we do not require your explicit consent under GDPR Article 6(1)(f) - Legitimate Interest.
        </p>
        <p>
          However, we inform you about our cookie usage through a dismissible banner when you first visit the site. This ensures transparency and allows you to make an informed decision about using Fire Tools.
        </p>
      </section>

      <section className="policy-section">
        <h2>Data Protection & GDPR Compliance</h2>
        <p>
          Our cookie practices are fully compliant with:
        </p>
        <ul>
          <li><strong>GDPR</strong> (General Data Protection Regulation - EU)</li>
          <li><strong>ePrivacy Directive</strong> (Cookie Law - EU)</li>
          <li><strong>CCPA</strong> (California Consumer Privacy Act - USA)</li>
          <li><strong>PECR</strong> (Privacy and Electronic Communications Regulations - UK)</li>
        </ul>
        <p>
          Key compliance points:
        </p>
        <ul>
          <li>✅ Only strictly necessary cookies used</li>
          <li>✅ No consent required for essential functionality</li>
          <li>✅ Clear information provided about cookie usage</li>
          <li>✅ Users can delete their data at any time</li>
          <li>✅ Data stored locally with AES-256 encryption</li>
          <li>✅ No data shared with third parties</li>
          <li>✅ No tracking or profiling</li>
        </ul>
      </section>

      <section className="policy-section">
        <h2>How Long Do Cookies Last?</h2>
        <p>
          All Fire Tools cookies are <strong>persistent cookies</strong> that expire after <strong>365 days</strong>. This means:
        </p>
        <ul>
          <li>Your data will be remembered for one year</li>
          <li>After one year, cookies expire and data is cleared</li>
          <li>You can manually clear cookies at any time</li>
          <li>Using the application refreshes the expiration date</li>
        </ul>
      </section>

      <section className="policy-section">
        <h2>Updates to Cookie Policy</h2>
        <p>
          We may update this Cookie Policy to reflect changes in our cookie usage or legal requirements. When we make changes, we will update the "Last Updated" date at the top of this page.
        </p>
        <p>
          Check this page periodically to stay informed about how we use cookies.
        </p>
      </section>

      <section className="policy-section">
        <h2>Questions About Cookies?</h2>
        <p>
          If you have questions about our cookie practices, please contact us:
        </p>
        <ul>
          <li><strong>Email:</strong> security@mb-consulting.dev</li>
          <li><strong>GitHub:</strong> <a href="https://github.com/mbianchidev/fire-tools" target="_blank" rel="noopener noreferrer">github.com/mbianchidev/fire-tools</a></li>
        </ul>
        <p>
          For information about how we handle your data overall, please see our{' '}
          <button type="button" className="policy-inline-link" onClick={onSwitchToPrivacy}>
            {t('legal.switchToPrivacyPolicy')}
          </button>.
        </p>
      </section>
    </>
  );
}
