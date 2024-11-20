import * as styles from './css/App.module.css';

import { memo, useEffect } from 'react';
import { letUserSelectCaptureArea } from './capture';

import logo from './images/react.svg';
import github from './videos/github.mp4';

export default memo(function App() {
  useEffect(() => {
    const capture = async (event: KeyboardEvent) => {
      if (event.altKey && event.ctrlKey && event.key === 'a') {
        event.preventDefault();

        console.log(await letUserSelectCaptureArea());
      }
    };

    window.addEventListener('keydown', capture);

    return () => {
      window.removeEventListener('keydown', capture);
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
