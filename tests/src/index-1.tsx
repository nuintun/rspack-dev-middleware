import App from './App';
import { createRoot } from 'react-dom/client';

const app = document.getElementById('app')!;
const root = createRoot(app);

root.render(<App />);

if (import.meta.webpackHot) {
  import(
    /* webpackMode: "eager" */
    'rspack-dev-middleware/client'
  ).then(({ on }) => {
    on('ok', ({ timestamp }) => {
      console.log(`[HMR] App is up to date at ${new Date(timestamp).toLocaleString()}`);
    });
  });
}
