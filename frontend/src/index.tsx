/* @refresh reload */
import { render } from 'solid-js/web';
import './utils/debug';
import App from './App';
import './styles/global.css';

const root = document.getElementById('root');

if (root) {
  const windowWithDispose = window as Window & { __edatimeDispose?: () => void };
  windowWithDispose.__edatimeDispose?.();
  root.replaceChildren();
  windowWithDispose.__edatimeDispose = render(() => <App />, root);
}
