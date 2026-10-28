// Inline form errors shared by the checkouts and the occasion form.
// Markup: <div class="field" data-field="name"> … <p class="field__error" id="name-error" hidden></p></div>
import { toast } from './ui.js';

// errors: { fieldName: message }. A 'form' key is shown as a toast.
export function showErrors(form, errors) {
  let first = null;
  for (const [name, message] of Object.entries(errors)) {
    if (name === 'form') {
      toast(message);
      continue;
    }
    const field = form.querySelector(`[data-field="${name}"]`);
    const error = field?.querySelector('.field__error');
    if (!field || !error) continue;
    field.classList.add('is-invalid');
    error.textContent = message;
    error.hidden = false;
    const input = field.querySelector('input, textarea, select');
    if (input && input.type !== 'radio' && input.type !== 'checkbox') {
      input.setAttribute('aria-invalid', 'true');
      const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== error.id);
      input.setAttribute('aria-describedby', [...ids, error.id].join(' '));
    }
    first ??= field;
  }
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    first.querySelector('input:not([type="radio"]):not([type="checkbox"]), textarea, select, input')?.focus({ preventScroll: true });
  }
}

export function clearError(form, name) {
  const field = form.querySelector(`[data-field="${name}"]`);
  if (!field?.classList.contains('is-invalid')) return;
  field.classList.remove('is-invalid');
  const error = field.querySelector('.field__error');
  error.hidden = true;
  const input = field.querySelector('input, textarea, select');
  if (input && input.type !== 'radio' && input.type !== 'checkbox') {
    input.removeAttribute('aria-invalid');
    const rest = (input.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== error.id);
    if (rest.length) input.setAttribute('aria-describedby', rest.join(' '));
    else input.removeAttribute('aria-describedby');
  }
}

// An error disappears as soon as the customer edits that field.
export function clearErrorsOnEdit(form) {
  const handler = (e) => {
    if (e.target.name) clearError(form, e.target.name);
  };
  form.addEventListener('input', handler);
  form.addEventListener('change', handler);
}
