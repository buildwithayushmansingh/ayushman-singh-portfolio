// Count-up stats, triggered once when the hero stats come into view
const counters = document.querySelectorAll('[data-count]');
let counted = false;

function runCounters() {
  if (counted) return;
  counted = true;
  counters.forEach(el => {
    const target = parseInt(el.getAttribute('data-count'), 10);
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

const statsSection = document.querySelector('.hero-stats');
if (statsSection) {
  const obs = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) runCounters(); }),
    { threshold: 0.4 }
  );
  obs.observe(statsSection);
}

// ---------- Certificate showcase: click a thumbnail to feature it ----------
(function () {
  const thumbs = document.querySelectorAll('.cert-thumb');
  if (!thumbs.length) return;

  const featuredImg = document.getElementById('certFeaturedImg');
  const featuredTitle = document.getElementById('certFeaturedTitle');
  const featuredIssuer = document.getElementById('certFeaturedIssuer');
  const featuredDesc = document.getElementById('certFeaturedDesc');
  const featuredTags = document.getElementById('certFeaturedTags');
  const featuredLink = document.getElementById('certFeaturedLink');

  thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => {
      // swap the featured panel's content to match the clicked thumbnail
      featuredImg.src = thumb.dataset.image;
      featuredImg.alt = thumb.dataset.title;
      featuredTitle.textContent = thumb.dataset.title;
      featuredIssuer.textContent = thumb.dataset.issuer;
      featuredDesc.textContent = thumb.dataset.desc;
      featuredLink.href = thumb.dataset.image;

      featuredTags.innerHTML = '';
      thumb.dataset.tags.split(',').forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = tag;
        featuredTags.appendChild(span);
      });

      thumbs.forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
})();

// ---------- Hero background: mouse + scroll parallax ----------
// Skipped entirely if the person has requested reduced motion.
(function () {
  const hero = document.getElementById('top');
  const bgLayer = document.getElementById('heroBgLayer');
  const heroOrbit = document.querySelector('.hero-orbit');
  if (!hero || !bgLayer) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

  let mouseX = 0, mouseY = 0;   // -1..1, normalized to hero center
  let smoothX = 0, smoothY = 0; // eased toward mouseX/Y each frame

  if (!isTouchDevice) {
    hero.addEventListener('mousemove', e => {
      const rect = hero.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    });
  }

  function tick() {
    smoothX += (mouseX - smoothX) * 0.04;
    smoothY += (mouseY - smoothY) * 0.04;

    // background drifts upward as the person scrolls past the hero
    const scrollShift = Math.min(window.scrollY, hero.offsetHeight) * 0.06;

    bgLayer.style.transform = `translate(${smoothX * 10}px, ${smoothY * 10 - scrollShift}px)`;
    if (heroOrbit) {
      // rings move less than the background text — creates a depth feel
      heroOrbit.style.transform = `translate(${smoothX * 4}px, ${smoothY * 4}px)`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

// ---------- Custom cursor: scanner reticle + trailing dust ----------
// Skipped entirely on touch devices (no mouse to track)
const isTouch = window.matchMedia('(pointer: coarse)').matches;

if (!isTouch) {
  const cursor = document.getElementById('cursor');
  const cursorLabel = document.getElementById('cursorLabel');

  // crosshair follows the pointer instantly (feels precise, no lag)
  window.addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
  });

  // hide reticle when it leaves the window
  document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });

  // brackets snap in + optional label on anything clickable
  const hoverTargets = 'a, button, .circuit-card, .orbit-card';
  document.querySelectorAll(hoverTargets).forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursor.classList.add('active');
      const text = el.dataset.cursorText;
      if (text) {
        cursorLabel.textContent = text;
        cursorLabel.classList.add('visible');
      }
    });
    el.addEventListener('mouseleave', () => {
      cursor.classList.remove('active');
      cursorLabel.classList.remove('visible');
    });
  });

  // comet-style trailing dust: a small pool of squares that chase the pointer
  // with staggered easing, each one lagging slightly more than the last
  const TRAIL_LENGTH = 6;
  const trailDots = [];
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const dot = document.createElement('div');
    dot.className = 'cursor-trail';
    dot.style.opacity = String(0.5 - i * 0.07);
    dot.style.transform = `translate(-50%,-50%) rotate(45deg) scale(${1 - i * 0.12})`;
    document.body.appendChild(dot);
    trailDots.push({ el: dot, x: 0, y: 0 });
  }

  let pointerX = 0, pointerY = 0;
  window.addEventListener('mousemove', e => {
    pointerX = e.clientX;
    pointerY = e.clientY;
  });

  function animateTrail() {
    let targetX = pointerX;
    let targetY = pointerY;
    trailDots.forEach(dot => {
      dot.x += (targetX - dot.x) * 0.35;
      dot.y += (targetY - dot.y) * 0.35;
      dot.el.style.left = dot.x + 'px';
      dot.el.style.top = dot.y + 'px';
      targetX = dot.x;
      targetY = dot.y;
    });
    requestAnimationFrame(animateTrail);
  }
  animateTrail();
}

// ---------- Interface sound ----------
// Small synthesized blips via Web Audio — no audio files needed.
// Off by default; the person turns it on with the speaker button.
// ---------- Interface sound ----------
// Small synthesized tunes via Web Audio — no audio files needed.
// Off by default; the person turns it on with the speaker button.
(function () {
  const toggle = document.getElementById('soundToggle');
  if (!toggle) return;

  let audioCtx = null;
  let soundOn = localStorage.getItem('soundOn') === 'true';
  toggle.setAttribute('aria-pressed', String(soundOn));

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // plays a short sequence of notes — lets hover/click/confirm each have
  // their own distinct little tune instead of one flat beep
  function playTune(frequencies, noteDuration, volume, waveType) {
    if (!soundOn) return;
    const ctx = getCtx();
    const vol = volume * (window.siteVolume ?? 0.85);
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = waveType;
      osc.frequency.value = freq;
      const startTime = ctx.currentTime + i * noteDuration * 0.85;
      gain.gain.setValueAtTime(vol, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });
  }

  function hoverTune() { playTune([660, 880], 0.07, 0.10, 'triangle'); }
  function clickTune() { playTune([740, 494], 0.09, 0.16, 'sine'); }
  function onTune() { playTune([523, 659, 784], 0.1, 0.18, 'sine'); } // confirmation when turning sound ON

  toggle.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('soundOn', String(soundOn));
    toggle.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) onTune();
  });

  // distinct hover chime + a louder, different click chime on interactive elements
  document.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('mouseenter', hoverTune);
    el.addEventListener('click', clickTune);
  });
})();
// subtle hover tick + slightly deeper click tone on interactive elements
document.querySelectorAll('a, button').forEach(el => {
  el.addEventListener('mouseenter', () => blip(880, 0.05, 0.02));
  el.addEventListener('click', () => blip(520, 0.08, 0.035));
});


// ---------- Profile menu: theme switch + sound + volume ----------
(function () {
  const profileMenu = document.getElementById('profileMenu');
  const avatarBtn = document.getElementById('profileAvatarBtn');
  const themeButtons = document.querySelectorAll('.theme-swatch');
  const volumeSlider = document.getElementById('volumeSlider');
  if (!profileMenu || !avatarBtn) return;

  // open/close dropdown — profile menu now lives in the always-visible top bar,
  // so it no longer needs to force the bottom nav open
  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = profileMenu.classList.toggle('open');
    avatarBtn.setAttribute('aria-expanded', String(isOpen));
  });
  document.addEventListener('click', (e) => {
    if (!profileMenu.contains(e.target)) {
      profileMenu.classList.remove('open');
      avatarBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // theme switching — 'cinematic' is the default, so it needs no data-theme attribute
  const themeSelect = document.getElementById('themeSelect');
  const themeLabel = document.getElementById('currentThemeLabel');
  const THEME_NAMES = { cinematic: 'Dark', light: 'Light', terminal: 'Terminal' };

  function applyTheme(theme) {
    if (theme === 'cinematic') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    themeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    if (themeLabel) themeLabel.textContent = THEME_NAMES[theme] || 'Dark';
    localStorage.setItem('siteTheme', theme);
  }

  const savedTheme = localStorage.getItem('siteTheme') || 'cinematic';
  applyTheme(savedTheme);

  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      if (themeSelect) themeSelect.removeAttribute('open'); // collapse back to one line
    });
  });

  // volume — read by blip() in the sound-toggle script above
  const savedVolume = localStorage.getItem('soundVolume');
  window.siteVolume = savedVolume !== null ? parseInt(savedVolume, 10) / 100 : 0.85;

  if (volumeSlider) {
    volumeSlider.value = Math.round(window.siteVolume * 100);
    volumeSlider.addEventListener('input', () => {
      window.siteVolume = volumeSlider.value / 100;
      localStorage.setItem('soundVolume', volumeSlider.value);
    });
  }
})();

// ---------- Scroll-reveal for section content ----------
(function () {
  const revealEls = document.querySelectorAll('.reveal-on-scroll');
  if (!revealEls.length) return;

  const obs = new IntersectionObserver(
    entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        obs.unobserve(entry.target);
      }
    }),
    { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
  );
  revealEls.forEach(el => obs.observe(el));
})();

// ---------- Sections menu: icon in the top bar opens a page list ----------
(function () {
  const trigger = document.getElementById('sectionsTrigger');
  const overlay = document.getElementById('sectionsOverlay');
  const closeBtn = document.getElementById('sectionsClose');
  if (!trigger || !overlay) return;

  function open() {
    overlay.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  }
  function close() {
    overlay.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', () => {
    overlay.hidden ? open() : close();
  });
  if (closeBtn) closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });
})();

// ---------- Terminal overlay: opens with Ctrl+K / Cmd+K, runs real commands ----------
(function () {
  const overlay = document.getElementById('termOverlay');
  const termBody = document.getElementById('termBody');
  const termInput = document.getElementById('termInput');
  const trigger = document.getElementById('cmdkTrigger');
  const escLabel = document.querySelector('.term-esc');
  if (!overlay || !termBody || !termInput) return;

  const PAGE_ROUTES = {
    home: '/', about: '/about', skills: '/skills',
    projects: '/projects', certificates: '/certificates', contact: '/contact'
  };

  function updateThemeLabel(theme) {
    const label = document.getElementById('currentThemeLabel');
    if (!label) return;
    const names = { cinematic: 'Dark', light: 'Light', terminal: 'Terminal' };
    label.textContent = names[theme] || 'Dark';
  }

  function setTheme(theme) {
    if (theme === 'dark' || theme === 'cinematic') {
      document.documentElement.removeAttribute('data-theme');
      theme = 'cinematic';
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('siteTheme', theme);
    document.querySelectorAll('.theme-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    updateThemeLabel(theme);
  }

  const commands = {
    help() {
      return 'Available commands: help, whoami, about, skills, projects, certificates, contact, resume, github, linkedin, theme <dark|light|terminal>, open <section>, clear';
    },
    whoami() { return 'ayushman@developer'; },
    about() {
      return "Second-year B.Tech CS student at GNIOT, specializing in full stack development. Building with HTML, CSS, JavaScript, Python, Flask, MySQL and SQLite.";
    },
    skills() {
      return 'HTML, CSS, JavaScript, Python, C, Flask, MySQL, SQLite, Git, GitHub, VS Code, Render';
    },
    projects() {
      return 'WattWise — AI-based energy optimization\nPrivate Photo Vault — secure photo storage\nGenAI Project — practical Generative AI\nPersonal Portfolio — this website';
    },
    certificates() {
      return 'Gold Certificate — Exploratory Data Analysis (FutureSkills Prime x NASSCOM)\nExploratory Data Analysis — Course Participation\nIntroduction to Generative AI (Google Cloud)\nNEXUS AI Quiz Ignite 2026 (Unstop)';
    },
    contact() {
      return 'email: ayushmansinghrajput3019@gmail.com\ngithub: github.com/buildwithayushmansingh\nlinkedin: linkedin.com/in/ayushman-singh-147434367';
    },
    resume() {
      window.open('https://www.linkedin.com/in/ayushman-singh-147434367/', '_blank', 'noopener');
      return "Resume isn't uploaded yet — opening LinkedIn instead.";
    },
    github() {
      window.open('https://github.com/buildwithayushmansingh', '_blank', 'noopener');
      return 'Opening GitHub...';
    },
    linkedin() {
      window.open('https://www.linkedin.com/in/ayushman-singh-147434367/', '_blank', 'noopener');
      return 'Opening LinkedIn...';
    },
    clear() {
      termBody.innerHTML = '';
      return null;
    }
  };

  function printLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'term-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    termBody.appendChild(div);
    termBody.scrollTop = termBody.scrollHeight;
  }

  function runCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    printLine(trimmed, 'term-cmd');

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'open' && parts[1]) {
      const target = parts[1].toLowerCase();
      if (PAGE_ROUTES[target]) {
        printLine('Opening ' + target + '...');
        setTimeout(() => { window.location.href = PAGE_ROUTES[target]; }, 300);
      } else {
        printLine("No page named '" + target + "' — try home, about, skills, projects, certificates or contact", 'term-error');
      }
      return;
    }

    if (cmd === 'theme' && parts[1]) {
      const target = parts[1].toLowerCase();
      if (['dark', 'cinematic', 'light', 'terminal'].includes(target)) {
        setTheme(target);
        printLine('Theme set to ' + target + '.');
      } else {
        printLine("Unknown theme '" + target + "' — try dark, light or terminal", 'term-error');
      }
      return;
    }

    if (commands[cmd]) {
      const out = commands[cmd]();
      if (out) printLine(out);
      return;
    }

    printLine("command not found: " + cmd + " — type 'help' for available commands", 'term-error');
  }

  function open() {
    overlay.hidden = false;
    setTimeout(() => termInput.focus(), 10);
  }
  function close() {
    overlay.hidden = true;
  }

  termInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      runCommand(termInput.value);
      termInput.value = '';
    } else if (e.key === 'Escape') {
      close();
    }
  });

  const termWindow = document.querySelector('.term-window');
  if (termWindow) {
    termWindow.addEventListener('click', () => termInput.focus());
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  if (escLabel) escLabel.addEventListener('click', close);

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      overlay.hidden ? open() : close();
    }
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  if (trigger) trigger.addEventListener('click', open);
})();

// ---------- GitHub Activity: live data from GitHub's public API ----------
(function () {
  const heatmap = document.getElementById('ghHeatmap');
  const monthsRow = document.getElementById('ghMonths');
  const reposEl = document.getElementById('ghRepos');
  const langsEl = document.getElementById('ghLangs');
  if (!heatmap) return;

  const USERNAME = 'buildwithayushmansingh';

  // repo count + distinct languages, for the stats row — GitHub's public REST API
  fetch(`https://api.github.com/users/${USERNAME}/repos?per_page=100`)
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(repos => {
      if (reposEl) reposEl.textContent = repos.length;
      const langs = new Set(repos.map(r => r.language).filter(Boolean));
      if (langsEl) langsEl.textContent = langs.size;
    })
    .catch(() => {

      if (repoGrid) repoGrid.innerHTML = '<div class="gh-error">Repositories are unavailable right now — <a href="https://github.com/' + USERNAME + '" target="_blank" rel="noopener">view the profile directly</a>.</div>';
    });

  // contribution calendar — GitHub doesn't expose this without login,
  // so this uses a well-known public community API instead
  const tooltip = document.getElementById('ghTooltip');
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function showTooltip(e, text) {
    if (!tooltip) return;
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
  }
  function hideTooltip() {
    if (tooltip) tooltip.hidden = true;
  }

  fetch(`https://github-contributions-api.jogruber.de/v4/${USERNAME}?y=last`)
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => {
      const all = data.contributions || [];
      const recent = all.slice(-182);
      if (!recent.length) return Promise.reject();

      // pad the front so day-of-week rows line up correctly (row 0 = Sunday)
      const firstDow = new Date(recent[0].date + 'T00:00:00').getDay();
      const padded = Array(firstDow).fill(null).concat(recent);
      const weekCount = Math.ceil(padded.length / 7);

      heatmap.innerHTML = '';
      heatmap.style.gridTemplateColumns = `repeat(${weekCount}, 14px)`;

      padded.forEach(day => {
        const cell = document.createElement('div');
        cell.className = 'gh-cell';
        if (!day) {
          cell.classList.add('pad');
        } else {
          const c = day.count;
          if (c === 0) cell.classList.add('l0');
          else if (c <= 2) cell.classList.add('l1');
          else if (c <= 5) cell.classList.add('l2');
          else if (c <= 9) cell.classList.add('l3');
          else cell.classList.add('l4');
          const niceDate = new Date(day.date + 'T00:00:00')
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const text = `${day.count} contribution${day.count === 1 ? '' : 's'} on ${niceDate}`;
          cell.addEventListener('mouseenter', e => showTooltip(e, text));
          cell.addEventListener('mousemove', e => showTooltip(e, text));
          cell.addEventListener('mouseleave', hideTooltip);
        }
        heatmap.appendChild(cell);
      });

      // month labels — one per week-column, aligned via the same column count
      if (monthsRow) {
        monthsRow.innerHTML = '';
        monthsRow.style.gridTemplateColumns = `repeat(${weekCount}, 14px)`;
        let lastMonth = -1;
        for (let w = 0; w < weekCount; w++) {
          let label = '';
          for (let r = 0; r < 7; r++) {
            const entry = padded[w * 7 + r];
            if (entry) {
              const m = new Date(entry.date + 'T00:00:00').getMonth();
              if (m !== lastMonth) { label = MONTH_NAMES[m]; lastMonth = m; }
              break;
            }
          }
          const span = document.createElement('span');
          span.textContent = label;
          monthsRow.appendChild(span);
        }
      }

      const total = all.reduce((sum, d) => sum + d.count, 0);
      const heading = document.getElementById('ghContribHeading');
      if (heading) heading.textContent = `${total} contributions in the last year`;
    })
    .catch(() => {
      heatmap.innerHTML = '<div class="gh-error">Live activity data is unavailable right now — <a href="https://github.com/' + USERNAME + '" target="_blank" rel="noopener">view the profile directly</a>.</div>';
    });
})();
// ---------- Developer ID card: 3D tilt + flip ----------
(function () {
  const card = document.getElementById('devCard');
  if (!card) return;

  card.addEventListener('click', () => card.classList.toggle('flipped'));

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isTouch || reduceMotion) return; // tap-to-flip still works — just skip the tilt

  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;   // 0..1
    const py = (e.clientY - rect.top) / rect.height;
    const tiltY = (px - 0.5) * 16;  // left/right tilt
    const tiltX = (0.5 - py) * 16;  // up/down tilt
    card.style.setProperty('--tilt-x', `${tiltX}deg`);
    card.style.setProperty('--tilt-y', `${tiltY}deg`);
    const face = card.classList.contains('flipped')
      ? card.querySelector('.dev-card-back')
      : card.querySelector('.dev-card-front');
    if (face) {
      face.style.setProperty('--shine-x', `${px * 100}%`);
      face.style.setProperty('--shine-y', `${py * 100}%`);
    }
  });

  card.addEventListener('mouseleave', () => {
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
  });
})();
// ---------- Developer ID card: QR code + share + download ----------
(function () {
  const card = document.getElementById('devCard');
  if (!card) return;

  const shareUrl = card.dataset.shareUrl;
  const qrContainer = document.getElementById('devCardQR');
  const shareBtn = document.getElementById('shareCardBtn');
  const downloadBtn = document.getElementById('downloadCardBtn');

  // QR code — generated client-side, points at the public /developer URL
  if (qrContainer && shareUrl && window.qrcode) {
    const qr = qrcode(0, 'M');
    qr.addData(shareUrl);
    qr.make();
    qrContainer.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2 });
  }

  // Share — native share sheet where available, clipboard copy otherwise
  if (shareBtn && shareUrl) {
    shareBtn.addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'My Developer ID', url: shareUrl });
        } catch (e) { /* user cancelled the native share sheet — fine */ }
      } else {
        try {
          await navigator.clipboard.writeText(shareUrl);
          shareBtn.textContent = 'Link copied!';
          setTimeout(() => { shareBtn.textContent = 'Share Card'; }, 1800);
        } catch (e) {
          window.prompt('Copy this link:', shareUrl);
        }
      }
    });
  }

  // Download — captures just the card element as a PNG (front face only)
  if (downloadBtn && window.html2canvas) {
    downloadBtn.addEventListener('click', async () => {
      const wasFlipped = card.classList.contains('flipped');
      card.classList.remove('flipped'); // always export the front face
      downloadBtn.textContent = 'Preparing…';
      try {
        const canvas = await html2canvas(card.querySelector('.dev-card-front'), {
          backgroundColor: null, useCORS: true, scale: 2
        });
        const link = document.createElement('a');
        link.download = 'developer-id-card.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (e) {
        alert('Could not generate the image right now — please try again.');
      } finally {
        downloadBtn.textContent = 'Download Card';
        if (wasFlipped) card.classList.add('flipped');
      }
    });
  }
})();
// ---------- Boot screen: code initialization intro ----------
(function () {
  const screen = document.getElementById('bootScreen');
  if (!screen || screen.classList.contains('boot-skip-instant')) return;

  const linesEl = document.getElementById('bootLines');
  const fillEl = document.getElementById('bootProgressFill');
  const pctEl = document.getElementById('bootProgressPct');
  const skipBtn = document.getElementById('bootSkip');

  // reflects this actual portfolio's real features — nothing invented
  const BOOT_LINES = [
    'Initializing developer environment...',
    'Loading theme engine...',
    'Mounting developer identity...',
    'Connecting to GitHub...',
    'Loading projects...',
    'Indexing certificates...',
    'Starting command terminal...',
    'Preparing interface audio...',
    'Compiling contact channel...',
    'Verifying configuration...'
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function finish() {
    screen.classList.add('boot-hide');
    setTimeout(() => { screen.style.display = 'none'; }, 650);
  }

  if (reduceMotion) {
    finish(); // respect reduced motion — skip straight to Home, no flashing sequence
    return;
  }

  let lineIndex = 0;
  const totalSteps = BOOT_LINES.length + 2; // + verify + success steps

  function updateProgress(step) {
    const pct = Math.min(Math.round((step / totalSteps) * 100), 100);
    fillEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';
  }

  function typeLine(text, num, onDone) {
    const row = document.createElement('div');
    row.className = 'boot-line';
    const numSpan = document.createElement('span');
    numSpan.className = 'boot-line-num';
    numSpan.textContent = String(num).padStart(2, '0');
    const textSpan = document.createElement('span');
    row.appendChild(numSpan);
    row.appendChild(textSpan);
    linesEl.appendChild(row);
    requestAnimationFrame(() => row.classList.add('boot-line-in'));

    let i = 0;
    const speed = 9; // ms per character — fast, fits the ~5s total budget
    const interval = setInterval(() => {
      textSpan.textContent = text.slice(0, i + 1);
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        onDone();
      }
    }, speed);
  }

  function runNext() {
    if (lineIndex >= BOOT_LINES.length) {
      showVerification();
      return;
    }
    updateProgress(lineIndex);
    typeLine(BOOT_LINES[lineIndex], lineIndex + 1, () => {
      lineIndex++;
      setTimeout(runNext, 40);
    });
  }

  function showVerification() {
    updateProgress(BOOT_LINES.length);
    const row = document.createElement('div');
    row.className = 'boot-line boot-verify';
    row.textContent = 'Verifying portfolio...';
    linesEl.appendChild(row);
    requestAnimationFrame(() => row.classList.add('boot-line-in'));
    setTimeout(showSuccess, 350);
  }

  function showSuccess() {
    updateProgress(BOOT_LINES.length + 1);
    const row = document.createElement('div');
    row.className = 'boot-line boot-success';
    row.innerHTML = '<span class="boot-check">✓</span>Access granted — initialization complete';
    linesEl.appendChild(row);
    requestAnimationFrame(() => row.classList.add('boot-line-in'));
    setTimeout(finish, 500);
  }

  skipBtn.addEventListener('click', finish);
  skipBtn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
  });

  runNext();
})();
// ---------- Fast typewriter effect for main headings ----------
(function () {
  const targets = document.querySelectorAll('.type-target');
  if (!targets.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  targets.forEach(el => {
    const text = el.innerText; // preserves <br> as a line break
    if (reduceMotion) {
      el.classList.remove('color-hidden');
      el.style.color = '';
      return;
    }

    const lines = text.split('\n');
    el.textContent = '';
    el.style.color = ''; // reveal as characters are typed in

    let li = 0, ci = 0;
    const speed = 35; // ms per character — fast, ~2-3s for these headings

    function step() {
      if (li >= lines.length) return;
      const line = lines[li];
      if (ci < line.length) {
        el.append(line[ci]);
        ci++;
        setTimeout(step, speed);
      } else {
        li++;
        ci = 0;
        if (li < lines.length) {
          el.append(document.createElement('br'));
          setTimeout(step, speed);
        }
      }
    }
    step();
  });
})();
// ---------- Portfolio AI assistant (advanced: streaming, rich cards, actions, voice, feedback) ----------
(function () {
  const fab = document.getElementById('aiFab');
  const panel = document.getElementById('aiPanel');
  const closeBtn = document.getElementById('aiPanelClose');
  const clearBtn = document.getElementById('aiPanelClear');
  const body = document.getElementById('aiPanelBody');
  const form = document.getElementById('aiForm');
  const input = document.getElementById('aiInput');
  const sendBtn = form ? form.querySelector('.ai-send-btn') : null;
  const micBtn = document.getElementById('aiMic');
  const counter = document.getElementById('aiCounter');
  if (!fab || !panel) return;

  const STORAGE_KEY = 'portfolioAiChat';
  const DEFAULT_CHIPS = ['Show my projects', 'Which projects use Flask?', 'Why should I hire Ayushman?', "What's your Developer level?", 'Switch to light theme'];
  let history = [];   // [{role, content, meta?}]  (meta = cards/link/suggestions/id for restore)
  let busy = false;

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const scrollDown = () => { body.scrollTop = body.scrollHeight; };
  const save = () => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-24))); } catch (e) { }
  };

  /* ---------- open / close ---------- */
  function openPanel() {
    panel.removeAttribute('hidden');
    requestAnimationFrame(() => panel.classList.add('ai-panel-open'));
    fab.classList.add('ai-fab-hidden');
    fab.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus(), 200);
  }
  function closePanel() {
    panel.classList.remove('ai-panel-open');
    fab.classList.remove('ai-fab-hidden');
    fab.setAttribute('aria-expanded', 'false');
    setTimeout(() => panel.setAttribute('hidden', ''), 250);
  }
  fab.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    const isOpen = panel.classList.contains('ai-panel-open');
    if (e.key === 'Escape' && isOpen) closePanel();
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); isOpen ? closePanel() : openPanel(); }
  });

  /* ---------- safe markdown-lite renderer (bold, `code`, bullets, links) ---------- */
  const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s,)]+|[\w.+-]+@[\w-]+\.[\w.-]+)/g;
  function renderInline(parent, text) {
    let last = 0, m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const tok = m[0];
      if (tok.startsWith('**')) parent.appendChild(el('strong', null, tok.slice(2, -2)));
      else if (tok.startsWith('`')) parent.appendChild(el('code', null, tok.slice(1, -1)));
      else {
        const a = el('a', 'ai-link', tok);
        const isUrl = /^https?:/.test(tok);
        a.href = isUrl ? tok : 'mailto:' + tok;
        if (isUrl) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        parent.appendChild(a);
      }
      last = m.index + tok.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function renderRich(target, text) {
    target.textContent = '';
    let list = null;
    text.split('\n').forEach(line => {
      const bullet = line.match(/^\s*[-*•]\s+(.*)/);
      if (bullet) {
        if (!list) { list = el('ul', 'ai-list'); target.appendChild(list); }
        const li = el('li'); renderInline(li, bullet[1]); list.appendChild(li);
      } else {
        list = null;
        if (line.trim() === '') return;
        const p = el('p'); renderInline(p, line); target.appendChild(p);
      }
    });
  }

  /* ---------- rich cards ---------- */
  function projectCard(p) {
    const c = el('div', 'ai-card');
    c.appendChild(el('div', 'ai-card-title', p.name));
    c.appendChild(el('div', 'ai-card-desc', p.description));
    const tags = el('div', 'ai-card-tags');
    (p.technologies || []).forEach(t => tags.appendChild(el('span', 'tag', t)));
    c.appendChild(tags);
    if (p.github) {
      const a = el('a', 'ai-card-link', 'GitHub →');
      a.href = p.github; a.target = '_blank'; a.rel = 'noopener noreferrer';
      c.appendChild(a);
    }
    return c;
  }
  function skillCard(cat) {
    const c = el('div', 'ai-card');
    c.appendChild(el('div', 'ai-card-title', cat.category));
    const tags = el('div', 'ai-card-tags');
    cat.skills.forEach(s => tags.appendChild(el('span', 'tag', s)));
    c.appendChild(tags);
    return c;
  }
  function certCard(cert) {
    const c = el('div', 'ai-card');
    c.appendChild(el('div', 'ai-card-title', cert.name));
    c.appendChild(el('div', 'ai-card-desc', cert.issuer + (cert.detail ? ' · ' + cert.detail : '')));
    return c;
  }
  function renderCards(container, cards) {
    if (!cards || !cards.items) return;
    const build = { projects: projectCard, skills: skillCard, certificates: certCard }[cards.type];
    if (!build) return;
    const wrap = el('div', 'ai-cards');
    cards.items.forEach(item => wrap.appendChild(build(item)));
    container.appendChild(wrap);
  }
  function renderLink(container, link) {
    if (!link || !link.url) return;
    const a = el('a', 'ai-action-btn', link.label + ' →');
    a.href = link.url;
    container.appendChild(a);
  }

  /* ---------- client actions the AI can trigger ---------- */
  function runAction(action) {
    if (!action) return;
    if (action.type === 'set_theme') {
      const sw = document.querySelector('.theme-swatch[data-theme="' + action.theme + '"]');
      if (sw) sw.click();
    } else if (action.type === 'open_terminal') {
      const trig = document.getElementById('cmdkTrigger');
      closePanel();
      setTimeout(() => {
        if (trig) trig.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      }, 300);
    }
  }

  /* ---------- message building ---------- */
  function userMessage(text) {
    const m = el('div', 'ai-msg ai-msg-user', text);
    body.appendChild(m);
    scrollDown();
  }
  function botShell() {
    const msg = el('div', 'ai-msg ai-msg-bot');
    const shell = { msg, text: el('div', 'ai-msg-text'), extras: el('div', 'ai-msg-extras'), tools: el('div', 'ai-msg-tools'), raw: '' };
    msg.append(shell.text, shell.extras, shell.tools);
    body.appendChild(msg);
    return shell;
  }
  function setText(shell, text) { shell.raw = text; renderRich(shell.text, text); scrollDown(); }

  function addTools(shell, chatId) {
    const copy = el('button', 'ai-tool-btn', '⧉ Copy');
    copy.type = 'button';
    copy.addEventListener('click', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(shell.raw).then(() => {
        copy.textContent = '✓ Copied'; setTimeout(() => (copy.textContent = '⧉ Copy'), 1500);
      }).catch(() => { });
    });
    shell.tools.appendChild(copy);
    if (chatId) {
      [['👍', 1], ['👎', -1]].forEach(([icon, rating]) => {
        const b = el('button', 'ai-tool-btn', icon);
        b.type = 'button'; b.setAttribute('aria-label', rating === 1 ? 'Helpful' : 'Not helpful');
        b.addEventListener('click', () => {
          fetch('/api/ai/feedback', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chatId, rating })
          }).catch(() => { });
          shell.tools.querySelectorAll('.ai-tool-btn').forEach(x => { if (x !== copy) x.disabled = true; });
          b.classList.add('active');
        });
        shell.tools.appendChild(b);
      });
    }
  }

  function showSuggestions(list) {
    body.querySelectorAll('.ai-suggestions').forEach(n => n.remove());
    if (!list || !list.length) return;
    const wrap = el('div', 'ai-suggestions');
    list.slice(0, 5).forEach(t => {
      const chip = el('button', 'ai-suggestion-chip', t);
      chip.type = 'button';
      chip.addEventListener('click', () => handleMessage(t));
      wrap.appendChild(chip);
    });
    body.appendChild(wrap);
    scrollDown();
  }

  function showTyping() {
    const t = el('div', 'ai-msg-typing');
    t.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(t);
    scrollDown();
    return t;
  }
  function setBusy(state) {
    busy = state;
    input.disabled = state;
    if (sendBtn) sendBtn.disabled = state;
    if (micBtn) micBtn.disabled = state;
    if (!state) input.focus();
  }
  function errorMessage(text) {
    const m = el('div', 'ai-msg ai-msg-bot ai-msg-error', text);
    body.appendChild(m);
    scrollDown();
  }

  /* ---------- sending (streaming NDJSON) ---------- */
  async function handleMessage(text) {
    if (busy || !text) return;
    body.querySelectorAll('.ai-suggestions').forEach(n => n.remove());
    userMessage(text);
    const prior = history.slice(-12).map(h => ({ role: h.role, content: h.content }));
    history.push({ role: 'user', content: text });
    setBusy(true);
    const typing = showTyping();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40000);
    let shell = null, meta = {}, finished = false;

    function ensureShell() {
      if (!shell) { typing.remove(); shell = botShell(); shell.msg.classList.add('ai-streaming'); }
      return shell;
    }
    function onEvent(ev) {
      if (ev.type === 'meta') {
        meta = Object.assign(meta, ev.data);
        const s = ensureShell();
        if (ev.data.message) setText(s, ev.data.message);
        renderCards(s.extras, ev.data.cards);
        renderLink(s.extras, ev.data.link);
        runAction(ev.data.action);
      } else if (ev.type === 'delta') {
        const s = ensureShell();
        setText(s, s.raw + ev.text);
      } else if (ev.type === 'done') {
        finished = true;
        const s = ensureShell();
        s.msg.classList.remove('ai-streaming');
        const id = ev.data && ev.data.id;
        addTools(s, id);
        history.push({
          role: 'assistant', content: s.raw,
          meta: { cards: meta.cards, link: meta.link, suggestions: meta.suggestions, id }
        });
        save();
        showSuggestions(meta.suggestions);
      } else if (ev.type === 'error') {
        throw new Error(ev.error);
      }
    }

    try {
      const res = await fetch('/api/ai/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: prior }), signal: controller.signal
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) onEvent(JSON.parse(line));
        }
      }
      if (!finished) throw new Error('The response was interrupted. Please try again.');
    } catch (err) {
      typing.remove();
      if (shell) shell.msg.classList.remove('ai-streaming');
      const timedOut = err && err.name === 'AbortError';
      errorMessage(timedOut ? 'That took too long — please try again.'
        : (err && err.message && !/fetch|network/i.test(err.message) ? err.message : "Couldn't reach the server. Check your connection and try again."));
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    updateCounter();
    handleMessage(text);
  });

  /* ---------- character counter ---------- */
  function updateCounter() {
    const left = 500 - input.value.length;
    if (left <= 100) { counter.hidden = false; counter.textContent = left + ' characters left'; }
    else counter.hidden = true;
  }
  input.addEventListener('input', updateCounter);

  /* ---------- voice input (Web Speech API, hidden if unsupported) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && micBtn) {
    micBtn.hidden = false;
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    let listening = false;
    rec.onresult = e => {
      const spoken = e.results[0][0].transcript;
      input.value = spoken;
      updateCounter();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    };
    rec.onend = () => { listening = false; micBtn.classList.remove('listening'); };
    rec.onerror = () => { listening = false; micBtn.classList.remove('listening'); };
    micBtn.addEventListener('click', () => {
      if (listening) { rec.stop(); return; }
      try { rec.start(); listening = true; micBtn.classList.add('listening'); } catch (e) { }
    });
  }

  /* ---------- clear / restore ---------- */
  function resetBody() {
    while (body.children.length > 1) body.removeChild(body.lastChild);
  }
  clearBtn.addEventListener('click', () => {
    history = [];
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { }
    resetBody();
    showSuggestions(DEFAULT_CHIPS);
  });

  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (saved.length) {
      history = saved;
      saved.forEach(h => {
        if (h.role === 'user') { userMessage(h.content); return; }
        const s = botShell();
        setText(s, h.content);
        if (h.meta) { renderCards(s.extras, h.meta.cards); renderLink(s.extras, h.meta.link); }
        addTools(s, h.meta && h.meta.id);
      });
      const last = saved[saved.length - 1];
      showSuggestions(last && last.meta && last.meta.suggestions);
    } else {
      showSuggestions(DEFAULT_CHIPS);
    }
  } catch (e) { showSuggestions(DEFAULT_CHIPS); }

  /* ---------- projects page: highlight cards the AI pointed at (?highlight=a,b) ---------- */
  const params = new URLSearchParams(location.search);
  const highlight = (params.get('highlight') || '').split(',').filter(Boolean);
  if (highlight.length) {
    document.querySelectorAll('.orbit-card[data-project-id]').forEach(card => {
      card.classList.add(highlight.includes(card.dataset.projectId) ? 'ai-highlight' : 'ai-dimmed');
    });
  }
})();