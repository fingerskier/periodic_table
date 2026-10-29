// Placeholder entry; the scene and panels are wired in by the integration step.
import { buildModel } from './model';

const model = buildModel('Lu');
document.querySelector('#stage')!.insertAdjacentHTML('beforeend', `<p>${model.elements.length} elements loaded.</p>`);
