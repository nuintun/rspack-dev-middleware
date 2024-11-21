import * as styles from './css/App.module.css';

import { memo, useEffect } from 'react';
import { selectCaptureArea } from './capture';

import logo from './images/react.svg';
import github from './videos/github.mp4';

export default memo(function App() {
  useEffect(() => {
    let capturing = false;

    const capture = (event: KeyboardEvent) => {
      if (!capturing && event.altKey && event.ctrlKey && /^a$/i.test(event.key)) {
        capturing = true;

        event.preventDefault();

        selectCaptureArea()
          .then(
            rect => {
              console.log(rect);
            },
            error => {
              console.error(error);
            }
          )
          .finally(() => {
            capturing = false;
          });
      }
    };

    window.addEventListener('keyup', capture);

    return () => {
      window.removeEventListener('keyup', capture);
    };
  });

  return (
    <div className={styles.main}>
      <img className={styles.logo} src={logo} alt="react" />
      <p className={styles.text}>hello rspack-dev-middleware + react!</p>
      <video muted controls autoPlay className={styles.video}>
        <source src={github} type="video/mp4" />
      </video>
    </div>
  );
});
