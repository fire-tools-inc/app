import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { PolicyModal } from '../../src/components/PolicyModal';

describe('PolicyModal', () => {
  describe('visibility', () => {
    it('should not render when isOpen is false', () => {
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={false}
            onClose={() => {}}
            policyType="privacy"
          />
        </BrowserRouter>
      );

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('should render when isOpen is true', () => {
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={true}
            onClose={() => {}}
            policyType="privacy"
          />
        </BrowserRouter>
      );

      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  describe('policy type content', () => {
    it('should display Privacy Policy heading when policyType is privacy', () => {
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={true}
            onClose={() => {}}
            policyType="privacy"
          />
        </BrowserRouter>
      );

      // The modal should have 'Privacy Policy' as the main title (h1)
      const titleElement = document.getElementById('policy-modal-title');
      expect(titleElement).toBeTruthy();
      expect(titleElement?.textContent).toBe('Privacy Policy');
    });

    it('should display Cookie Policy heading when policyType is cookie', () => {
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={true}
            onClose={() => {}}
            policyType="cookie"
          />
        </BrowserRouter>
      );

      // The modal should have 'Cookie Policy' as the main title (h1)
      const titleElement = document.getElementById('policy-modal-title');
      expect(titleElement).toBeTruthy();
      expect(titleElement?.textContent).toBe('Cookie Policy');
    });
  });

  describe('close functionality', () => {
    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={true}
            onClose={onClose}
            policyType="privacy"
          />
        </BrowserRouter>
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when overlay is clicked', () => {
      const onClose = vi.fn();
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={true}
            onClose={onClose}
            policyType="privacy"
          />
        </BrowserRouter>
      );

      // Click on the overlay (dialog element)
      const overlay = screen.getByRole('dialog');
      fireEvent.click(overlay);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when modal content is clicked', () => {
      const onClose = vi.fn();
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={true}
            onClose={onClose}
            policyType="privacy"
          />
        </BrowserRouter>
      );

      // Click on the content container (not the overlay)
      const titleElement = document.getElementById('policy-modal-title');
      expect(titleElement).toBeTruthy();
      fireEvent.click(titleElement!);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have proper aria-modal attribute', () => {
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={true}
            onClose={() => {}}
            policyType="privacy"
          />
        </BrowserRouter>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    it('should have proper aria-labelledby attribute', () => {
      render(
        <BrowserRouter>
          <PolicyModal 
            isOpen={true}
            onClose={() => {}}
            policyType="privacy"
          />
        </BrowserRouter>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-labelledby')).toBe('policy-modal-title');
    });
  });
});
