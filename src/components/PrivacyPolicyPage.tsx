import { useTranslation } from 'react-i18next';
import './PolicyPages.css';

export function PrivacyPolicyPage() {
  const { t } = useTranslation();
  return (
    <div className="policy-page">
      <div className="policy-container">
        <h1>{t('legal.privacyPolicy')}</h1>
        <p className="last-updated">
          <strong>{t('legal.lastUpdated')}</strong> December 31, 2025
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
            For detailed information about cookies we use, please see our <a href="/cookie-policy">Cookie Policy</a>.
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
      </div>
    </div>
  );
}
