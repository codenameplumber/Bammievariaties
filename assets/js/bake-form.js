// Form pieces shared by the Bake & Cook checkout and the occasion request.
import { BAKE } from './config.js';
import { icon, escapeHtml } from './ui.js';

export const OCCASION_WANTS = [
  'Small chops', 'Meat pie & pastries', 'Chin chin & snacks', 'Puff-puff',
  'Celebration cake', 'Cupcakes', 'Jollof or fried rice', 'Something else',
];

export function wantChoices() {
  return OCCASION_WANTS.map((want) => `
    <label class="choice choice--compact">
      <input type="checkbox" name="wants" value="${escapeHtml(want)}">
      <span class="choice__tick">${icon('check')}</span>
      <span class="choice__title">${escapeHtml(want)}</span>
    </label>`).join('');
}

export function timeSlotChoices() {
  return Object.entries(BAKE.timeSlots).map(([value, label]) => `
    <label class="choice choice--compact">
      <input type="radio" name="timeSlot" value="${escapeHtml(value)}">
      <span class="choice__tick choice__tick--round">${icon('check')}</span>
      <span class="choice__title">${escapeHtml(label)}</span>
    </label>`).join('');
}

export function occasionOptions(list = BAKE.occasions) {
  return list.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
}
