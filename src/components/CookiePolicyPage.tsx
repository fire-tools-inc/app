import { useTranslation } from 'react-i18next';
import './PolicyPages.css';

export function CookiePolicyPage() {
  const { t } = useTranslation();
  return (
    <div className="policy-page">
      <div className="policy-container">
        <h1>{t('legal.cookiePolicy')}</h1>
        <p className="last-updated">
          <strong>{t('legal.lastUpdated')}</strong> December 31, 2025
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
            For information about how we handle your data overall, please see our <a href="/privacy-policy">Privacy Policy</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
