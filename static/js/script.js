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
// ---------- Nexus AI assistant (streaming, modes, slash commands, rich cards, voice, export) ----------
(function () {
  const $ = id => document.getElementById(id);
  const root = $('nxRoot');
  if (!root) return;
  const orb = $('nxOrb'), panel = $('nxPanel'), body = $('nxBody'), form = $('nxForm'), input = $('nxInput');
  const sendBtn = $('nxSend'), micBtn = $('nxMic'), counter = $('nxCounter'), chipsBox = $('nxChips');
  const slash = $('nxSlash'), statusText = $('nxStatus'), modesBox = $('nxModes');
  const teaser = $('nxTeaser'), teaserText = $('nxTeaserText');
  const speakBtn = $('nxSpeak'), expandBtn = $('nxExpand');

  const KEY = 'nexusAiChat', MODE_KEY = 'nexusAiMode', TEASE_KEY = 'nexusAiTeaser';
  const path = location.pathname;
  const MODES = ['auto', 'recruiter', 'tech', 'casual'];
  const PLACEHOLDER = {
    auto: 'Ask anything, or type / for commands',
    recruiter: 'Ask about skills, availability, hiring…',
    tech: 'Ask about the stack, projects, architecture…',
    casual: 'Kuch bhi pucho 😎'
  };
  const PAGE_CHIPS = {
    '/projects': ['Compare my projects', 'Which projects use Flask?', 'Surprise me', 'Show my projects'],
    '/skills': ['What are my skills?', 'Which projects use Python?', 'Does he know MySQL?'],
    '/certificates': ['Show my certificates', 'Show my projects', 'Why should I hire Ayushman?'],
    '/contact': ['Send a message to Ayushman', 'How can I contact Ayushman?', 'Is he open to work?'],
    '/developer': ["What's your Developer level?", 'Show GitHub activity', 'Show my projects'],
    '/github': ['Show GitHub activity', "What's your Developer level?", 'Show my projects']
  };
  const DEFAULT_CHIPS = ['Show my projects', 'Why should I hire Ayushman?', "What's your Developer level?", 'Surprise me', '/match'];
  const TEASERS = {
    '/projects': 'Want me to compare two of these projects?',
    '/skills': 'Ask me which projects use any skill.',
    '/contact': 'I can draft a message to Ayushman for you.',
    '/certificates': 'Curious how these certificates fit a role? Try /match.'
  };
  const THINKING = ['Scanning portfolio…', 'Connecting the dots…', 'Composing answer…'];
  const COMMANDS = [
    { cmd: '/projects', desc: 'Show all projects', text: 'Show my projects' },
    { cmd: '/skills', desc: 'Skills by category', text: 'What are my skills?' },
    { cmd: '/certs', desc: 'Certificates', text: 'Show my certificates' },
    { cmd: '/level', desc: 'Developer level & XP', text: "What's your Developer level?" },
    { cmd: '/compare', desc: 'Compare two projects', fill: 'Compare ' },
    { cmd: '/match', desc: 'Paste a job description → fit score', fill: '/match ' },
    { cmd: '/surprise', desc: 'Random project spotlight', text: 'Surprise me' },
    { cmd: '/message', desc: 'Write to Ayushman', text: 'Send a message to Ayushman' },
    { cmd: '/contact', desc: 'Contact details', text: 'How can I contact Ayushman?' },
    { cmd: '/resume', desc: 'Resume / LinkedIn', text: 'Show resume' },
    { cmd: '/theme', desc: 'dark | light | terminal', fill: '/theme ' },
    { cmd: '/help', desc: 'What can I do?', text: 'help' },
    { cmd: '/clear', desc: 'Clear this chat', run: 'clear' }
  ];

  let history = [];          // [{role, content, meta?}]
  let busy = false, activeCtrl = null, userStopped = false;
  let mode = 'auto', speakOn = false, thinkTimer = null;
  try { const m = sessionStorage.getItem(MODE_KEY); if (MODES.includes(m)) mode = m; } catch (e) { }

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const scrollDown = () => { body.scrollTop = body.scrollHeight; };
  const settleScroll = () => { scrollDown(); requestAnimationFrame(scrollDown); setTimeout(scrollDown, 450); };
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-24))); } catch (e) { } };

  /* ---------- open / close / expand ---------- */
  function openPanel() {
    panel.removeAttribute('hidden');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    orb.classList.add('is-hidden');
    orb.setAttribute('aria-expanded', 'true');
    teaser.hidden = true;
    try { sessionStorage.setItem(TEASE_KEY, '1'); } catch (e) { }
    setTimeout(() => input.focus(), 250);
  }
  function closePanel() {
    panel.classList.remove('is-open');
    orb.classList.remove('is-hidden');
    orb.setAttribute('aria-expanded', 'false');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setTimeout(() => { if (!panel.classList.contains('is-open')) panel.setAttribute('hidden', ''); }, 320);
  }
  orb.addEventListener('click', openPanel);
  $('nxClose').addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    const isOpen = panel.classList.contains('is-open');
    if (e.key === 'Escape' && isOpen) closePanel();
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); isOpen ? closePanel() : openPanel(); }
  });
  expandBtn.addEventListener('click', () => {
    const on = panel.classList.toggle('is-expanded');
    expandBtn.setAttribute('aria-pressed', String(on));
    setTimeout(scrollDown, 520);
  });

  /* ---------- state helpers ---------- */
  function setState(state) {            // 'idle' | 'thinking' | 'streaming' | 'listening'
    panel.classList.toggle('is-thinking', state === 'thinking');
    panel.classList.toggle('is-streaming', state === 'streaming');
    panel.classList.toggle('is-listening', state === 'listening');
    statusText.textContent = { idle: 'Online', thinking: 'Thinking…', streaming: 'Responding…', listening: 'Listening…' }[state];
  }
  function setBusy(v) {
    busy = v;
    input.disabled = v;
    sendBtn.classList.toggle('is-stop', v);
    sendBtn.setAttribute('aria-label', v ? 'Stop' : 'Send');
    if (micBtn) micBtn.disabled = v;
    if (!v) { setState('idle'); input.focus(); }
  }

  /* ---------- modes ---------- */
  function applyMode(m, persist) {
    mode = m;
    modesBox.style.setProperty('--idx', MODES.indexOf(m));
    modesBox.querySelectorAll('.nx-mode').forEach(b => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    input.placeholder = PLACEHOLDER[m];
    if (persist) { try { sessionStorage.setItem(MODE_KEY, m); } catch (e) { } }
  }
  modesBox.querySelectorAll('.nx-mode').forEach(b => b.addEventListener('click', () => applyMode(b.dataset.mode, true)));
  applyMode(mode, false);

  /* ---------- safe markdown-lite ---------- */
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
        const a = el('a', 'nx-link', tok);
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
        if (!list) { list = el('ul', 'nx-list'); target.appendChild(list); }
        const li = el('li'); renderInline(li, bullet[1]); list.appendChild(li);
      } else {
        list = null;
        if (line.trim() === '') return;
        const p = el('p'); renderInline(p, line); target.appendChild(p);
      }
    });
  }

  /* ---------- rich cards ---------- */
  const tag = (t, cls) => el('span', 'nx-tag' + (cls ? ' ' + cls : ''), t);
  const tagRow = (list, cls) => { const r = el('div', 'nx-tags'); (list || []).forEach(t => r.appendChild(tag(t, cls))); return r; };
  function glow(card) {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }
  function newCard(i) { const c = el('div', 'nx-card'); c.style.setProperty('--i', i || 0); glow(c); return c; }
  function extLink(text, url, cls) {
    const a = el('a', cls || 'nx-card-link', text);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }

  function projectCard(p, i) {
    const c = newCard(i), head = el('div', 'nx-card-head');
    head.append(el('span', 'nx-card-num', String(i + 1).padStart(2, '0')), el('span', 'nx-card-title', p.name));
    c.append(head, el('div', 'nx-card-desc', p.description), tagRow(p.technologies));
    if (p.github) c.appendChild(extLink('GitHub →', p.github));
    return c;
  }
  function skillCard(cat, i) {
    const c = newCard(i);
    c.append(el('div', 'nx-card-title', cat.category), tagRow(cat.skills, 'is-alt'));
    return c;
  }
  function certCard(cert, i) {
    const c = newCard(i), head = el('div', 'nx-card-head'), medal = el('span', 'nx-medal');
    medal.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 21l5-3 5 3-1.5-7.5"/></svg>';
    const txt = el('div');
    txt.append(el('div', 'nx-card-title', cert.name), el('div', 'nx-card-desc', cert.issuer + (cert.detail ? ' · ' + cert.detail : '')));
    head.append(medal, txt);
    c.appendChild(head);
    return c;
  }
  function spotlightCard(p) {
    const c = newCard(0); c.classList.add('nx-spot');
    const banner = el('div', 'nx-spot-banner');
    banner.append(el('span', 'nx-spot-initial', (p.name || '?').charAt(0)), el('span', 'nx-spot-label', 'PROJECT SPOTLIGHT'));
    const bodyEl = el('div', 'nx-spot-body'), actions = el('div', 'nx-spot-actions');
    if (p.github) actions.appendChild(extLink('GitHub →', p.github, 'nx-btn is-primary'));
    const hl = el('a', 'nx-btn', 'Highlight on page'); hl.href = '/projects?highlight=' + encodeURIComponent(p.id);
    actions.appendChild(hl);
    bodyEl.append(el('div', 'nx-card-title', p.name), el('div', 'nx-card-desc', p.description), tagRow(p.technologies), actions);
    c.append(banner, bodyEl);
    return c;
  }
  function compareCard(d) {
    const c = newCard(0);
    const cols = el('div', 'nx-compare');
    d.items.forEach((it, idx) => {
      const col = el('div', 'nx-compare-col' + (idx ? ' is-b' : ''));
      col.append(el('div', 'nx-card-title', it.name), el('div', 'nx-mini', 'ONLY IN THIS'),
        tagRow((it.technologies || []).filter(t => !(d.shared || []).includes(t)), idx ? 'is-alt' : ''));
      cols.appendChild(col);
    });
    const shared = el('div', 'nx-compare-shared');
    shared.append(el('div', 'nx-mini', 'SHARED STACK'), (d.shared && d.shared.length) ? tagRow(d.shared, 'is-ok') : el('div', 'nx-card-desc', 'No overlap'));
    c.append(cols, shared);
    return c;
  }
  function matchCard(d) {
    const c = newCard(0), top = el('div', 'nx-match');
    const ring = el('div', 'nx-ring'), num = el('span', 'nx-ring-num');
    num.innerHTML = '<b></b><small>%</small>';
    num.querySelector('b').textContent = d.score;
    ring.appendChild(num);
    ring.style.setProperty('--nx-pct', 0);
    requestAnimationFrame(() => requestAnimationFrame(() => ring.style.setProperty('--nx-pct', d.score)));
    ring.classList.add(d.score >= 75 ? 'is-high' : d.score >= 50 ? 'is-mid' : 'is-low');
    const info = el('div');
    info.append(el('div', 'nx-card-title', d.verdict), el('div', 'nx-card-desc', 'Based on technologies named in the description'));
    top.append(ring, info);
    c.appendChild(top);
    if (d.matched && d.matched.length) { c.append(el('div', 'nx-mini', 'YOU HAVE'), tagRow(d.matched, 'is-ok')); }
    if (d.missing && d.missing.length) { c.append(el('div', 'nx-mini', 'GAPS'), tagRow(d.missing, 'is-miss')); }
    if (d.projects && d.projects.length) { c.append(el('div', 'nx-mini', 'RELEVANT PROJECTS'), tagRow(d.projects, 'is-alt')); }
    return c;
  }
  function contactCard(email) {
    const c = newCard(0); c.classList.add('nx-form-card');
    const name = el('input', 'nx-field'); name.placeholder = 'Your name'; name.maxLength = 80;
    const msg = el('textarea', 'nx-field'); msg.placeholder = 'Write your message…'; msg.rows = 3; msg.maxLength = 800;
    const send = el('button', 'nx-btn is-primary', 'Open in email app'); send.type = 'button';
    const copy = el('button', 'nx-btn', 'Copy message'); copy.type = 'button';
    const compose = () => (msg.value.trim() + (name.value.trim() ? '\n\n— ' + name.value.trim() : ''));
    send.addEventListener('click', () => {
      if (!msg.value.trim()) { msg.focus(); return; }
      window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Hello from your portfolio') + '&body=' + encodeURIComponent(compose());
    });
    copy.addEventListener('click', () => {
      if (navigator.clipboard && msg.value.trim()) navigator.clipboard.writeText(compose()).then(() => {
        copy.textContent = 'Copied ✓'; setTimeout(() => (copy.textContent = 'Copy message'), 1500);
      }).catch(() => { });
    });
    const row = el('div', 'nx-spot-actions'); row.append(send, copy);
    c.append(name, msg, row, el('div', 'nx-form-note', 'Opens your own email app — nothing is sent from this site.'));
    return c;
  }
  function renderCards(box, cards) {
    if (!cards) return;
    const wrap = el('div', 'nx-cards');
    switch (cards.type) {
      case 'projects': cards.items.forEach((p, i) => wrap.appendChild(projectCard(p, i))); break;
      case 'skills': cards.items.forEach((s, i) => wrap.appendChild(skillCard(s, i))); break;
      case 'certificates': cards.items.forEach((c, i) => wrap.appendChild(certCard(c, i))); break;
      case 'spotlight': wrap.appendChild(spotlightCard(cards.items[0])); break;
      case 'compare': wrap.appendChild(compareCard(cards)); break;
      case 'match': wrap.appendChild(matchCard(cards)); break;
      case 'contact_form': wrap.appendChild(contactCard(cards.email)); break;
      default: return;
    }
    box.appendChild(wrap);
  }
  function renderLink(box, link) {
    if (!link || !link.url) return;
    const a = el('a', 'nx-action', link.label + ' →');
    a.href = link.url;
    if (/^https?:/.test(link.url)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    box.appendChild(a);
  }

  /* ---------- client actions ---------- */
  function runAction(action) {
    if (!action) return;
    if (action.type === 'set_theme') {
      const sw = document.querySelector('.theme-swatch[data-theme="' + action.theme + '"]');
      if (sw) sw.click();
    } else if (action.type === 'open_terminal') {
      const trig = $('cmdkTrigger');
      closePanel();
      setTimeout(() => {
        if (trig) trig.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      }, 350);
    }
  }

  /* ---------- text-to-speech ---------- */
  const synth = window.speechSynthesis;
  const plain = t => t.replace(/\*\*|`/g, '').replace(/^\s*[-*•]\s+/gm, '');
  function speak(text) {
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(plain(text));
    u.lang = 'en-IN'; u.rate = 1.02;
    synth.speak(u);
  }
  if (!synth) speakBtn.hidden = true;
  speakBtn.addEventListener('click', () => {
    speakOn = !speakOn;
    speakBtn.setAttribute('aria-pressed', String(speakOn));
    if (!speakOn && synth) synth.cancel();
  });

  /* ---------- message building ---------- */
  function userMessage(text) { body.appendChild(el('div', 'nx-msg nx-msg-user', text)); scrollDown(); }
  function botShell() {
    const msg = el('div', 'nx-msg nx-msg-bot');
    const shell = { msg, text: el('div', 'nx-msg-text'), extras: el('div', 'nx-extras'), tools: el('div', 'nx-tools'), raw: '' };
    msg.append(shell.text, shell.extras, shell.tools);
    body.appendChild(msg);
    return shell;
  }
  function setText(shell, text) { shell.raw = text; renderRich(shell.text, text); scrollDown(); }

  function addTools(shell, chatId) {
    const mk = (label, aria) => { const b = el('button', 'nx-tool', label); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); return b; };
    const copy = mk('Copy');
    copy.addEventListener('click', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(shell.raw).then(() => {
        copy.textContent = 'Copied ✓'; setTimeout(() => (copy.textContent = 'Copy'), 1500);
      }).catch(() => { });
    });
    shell.tools.appendChild(copy);
    if (synth) { const l = mk('Listen'); l.addEventListener('click', () => speak(shell.raw)); shell.tools.appendChild(l); }
    if (chatId) {
      [['👍', 1, 'Helpful'], ['👎', -1, 'Not helpful']].forEach(([icon, rating, aria]) => {
        const b = mk(icon, aria);
        b.addEventListener('click', () => {
          fetch('/api/ai/feedback', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chatId, rating })
          }).catch(() => { });
          shell.tools.querySelectorAll('.nx-tool').forEach(x => { if (/👍|👎/.test(x.textContent)) x.disabled = true; });
          b.classList.add('is-active');
        });
        shell.tools.appendChild(b);
      });
    }
  }

  function showChips(list) {
    chipsBox.textContent = '';
    (list || []).slice(0, 5).forEach((t, i) => {
      const chip = el('button', 'nx-chip', t);
      chip.type = 'button';
      chip.style.setProperty('--i', i);
      chip.addEventListener('click', () => (t.startsWith('/') ? runCommand(t) : handleMessage(t)));
      chipsBox.appendChild(chip);
    });
  }
  function startChips() { return PAGE_CHIPS[path] || DEFAULT_CHIPS; }

  function showThinking() {
    const t = el('div', 'nx-thinking');
    const bars = el('span', 'nx-thinking-bars'); bars.innerHTML = '<i></i><i></i><i></i><i></i>';
    const label = el('span', 'nx-thinking-text', THINKING[0]);
    t.append(bars, label);
    body.appendChild(t);
    scrollDown();
    let i = 0;
    thinkTimer = setInterval(() => { i = (i + 1) % THINKING.length; label.textContent = THINKING[i]; }, 1300);
    return t;
  }
  function stopThinkingTimer() { if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null; } }

  function errorMessage(text, retry) {
    const m = el('div', 'nx-msg nx-msg-bot nx-msg-error');
    m.appendChild(el('div', 'nx-msg-text', text));
    if (retry) {
      const b = el('button', 'nx-tool nx-retry', 'Retry'); b.type = 'button';
      b.addEventListener('click', () => { m.remove(); handleMessage(retry.text, retry.display, { retry: true }); });
      m.appendChild(b);
    }
    body.appendChild(m);
    settleScroll();
  }

  /* ---------- sending (streaming NDJSON) ---------- */
  async function handleMessage(text, display, opts) {
    if (busy || !text) return;
    display = display || text;
    opts = opts || {};
    chipsBox.textContent = '';
    hideSlash();
    if (!opts.retry) {
      userMessage(display);
      history.push({ role: 'user', content: display });
    }
    const prior = history.slice(0, -1).slice(-12).map(h => ({ role: h.role, content: h.content }));
    setBusy(true);
    setState('thinking');
    const thinking = showThinking();

    const controller = new AbortController();
    activeCtrl = controller; userStopped = false;
    const timer = setTimeout(() => controller.abort(), 40000);
    let shell = null, meta = {}, finished = false;

    function ensureShell() {
      if (!shell) {
        stopThinkingTimer(); thinking.remove();
        shell = botShell(); shell.msg.classList.add('is-streaming');
        setState('streaming');
      }
      return shell;
    }
    function finish(id) {
      const s = ensureShell();
      s.msg.classList.remove('is-streaming');
      addTools(s, id);
      history.push({ role: 'assistant', content: s.raw, meta: { cards: meta.cards, link: meta.link, suggestions: meta.suggestions, id } });
      save();
      showChips(meta.suggestions);
      settleScroll();
      if (speakOn) speak(s.raw);
    }
    function onEvent(ev) {
      if (ev.type === 'meta') {
        meta = Object.assign(meta, ev.data);
        const s = ensureShell();
        if (ev.data.message) setText(s, ev.data.message);
        renderCards(s.extras, ev.data.cards);
        renderLink(s.extras, ev.data.link);
        runAction(ev.data.action);
        settleScroll();
      } else if (ev.type === 'delta') {
        const s = ensureShell();
        setText(s, s.raw + ev.text);
      } else if (ev.type === 'done') {
        finished = true;
        finish(ev.data && ev.data.id);
      } else if (ev.type === 'error') {
        throw new Error(ev.error);
      }
    }

    try {
      const res = await fetch('/api/ai/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: prior, mode }), signal: controller.signal
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
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
      if (!finished) throw new Error('The response was interrupted.');
    } catch (err) {
      stopThinkingTimer(); thinking.remove();
      if (userStopped) {
        if (shell) { shell.msg.classList.remove('is-streaming'); if (!finished) finish(null); }
      } else {
        if (shell) shell.msg.classList.remove('is-streaming');
        const timedOut = err && err.name === 'AbortError';
        const friendly = timedOut ? 'That took too long.'
          : (err && err.message && !/fetch|network|load failed/i.test(err.message) ? err.message : "Couldn't reach the server. Check your connection.");
        errorMessage(friendly, { text, display });
      }
    } finally {
      clearTimeout(timer); stopThinkingTimer(); activeCtrl = null;
      setBusy(false);
    }
  }

  /* ---------- slash commands ---------- */
  let slashItems = [], slashIdx = 0;
  function hideSlash() { slash.hidden = true; slashItems = []; }
  function renderSlash() {
    slash.textContent = '';
    slashItems.forEach((c, i) => {
      const b = el('button', 'nx-slash-item' + (i === slashIdx ? ' is-active' : ''));
      b.type = 'button'; b.setAttribute('role', 'option');
      b.append(el('b', null, c.cmd), el('span', null, c.desc));
      b.addEventListener('mousedown', e => { e.preventDefault(); pickSlash(c); });
      slash.appendChild(b);
    });
    slash.hidden = false;
  }
  function updateSlash() {
    const v = input.value.toLowerCase();
    if (!v.startsWith('/') || /\s/.test(v)) { hideSlash(); return; }
    slashItems = COMMANDS.filter(c => c.cmd.startsWith(v));
    if (!slashItems.length) { hideSlash(); return; }
    slashIdx = 0; renderSlash();
  }
  function clearChat() {
    history = [];
    try { sessionStorage.removeItem(KEY); } catch (e) { }
    if (synth) synth.cancel();
    while (body.children.length > 1) body.removeChild(body.lastChild);
    showChips(startChips());
  }
  function pickSlash(c) {
    hideSlash();
    if (c.run === 'clear') { input.value = ''; clearChat(); return; }
    if (c.fill) { input.value = c.fill; input.focus(); updateCounter(); return; }
    input.value = ''; updateCounter();
    handleMessage(c.text);
  }
  function runCommand(raw) {
    const text = raw.trim();
    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.toLowerCase(), arg = rest.join(' ');
    const c = COMMANDS.find(x => x.cmd === cmd);
    if (cmd === '/match') {
      if (arg) handleMessage(text, text.length > 120 ? text.slice(0, 117) + '…' : text);
      else { input.value = '/match '; input.focus(); }
      return;
    }
    if (cmd === '/theme') { handleMessage('Switch to ' + (arg || 'dark') + ' theme'); return; }
    if (cmd === '/compare') { arg ? handleMessage('Compare ' + arg) : (input.value = 'Compare ', input.focus()); return; }
    if (c) { pickSlash(c); return; }
    handleMessage(text);
  }

  input.addEventListener('input', () => { updateSlash(); updateCounter(); });
  input.addEventListener('keydown', e => {
    if (slash.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); slashIdx = (slashIdx + 1) % slashItems.length; renderSlash(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); slashIdx = (slashIdx - 1 + slashItems.length) % slashItems.length; renderSlash(); }
    else if (e.key === 'Tab' || (e.key === 'Enter' && slashItems.length)) { e.preventDefault(); pickSlash(slashItems[slashIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideSlash(); }
  });

  /* ---------- counter ---------- */
  function limitFor(v) { return v.trim().toLowerCase().startsWith('/match') ? 2000 : 500; }
  function updateCounter() {
    const left = limitFor(input.value) - input.value.length;
    if (left <= 100) {
      counter.hidden = false;
      counter.textContent = left >= 0 ? left + ' characters left' : 'Too long by ' + (-left) + ' characters';
      counter.classList.toggle('is-over', left < 0);
    } else counter.hidden = true;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (busy) return;
    const text = input.value.trim();
    if (!text) return;
    if (input.value.length > limitFor(input.value)) { updateCounter(); return; }
    input.value = '';
    updateCounter(); hideSlash();
    text.startsWith('/') ? runCommand(text) : handleMessage(text);
  });
  sendBtn.addEventListener('click', e => {
    if (busy) { e.preventDefault(); userStopped = true; if (activeCtrl) activeCtrl.abort(); }
  });

  /* ---------- voice input ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && micBtn) {
    micBtn.hidden = false;
    const rec = new SR();
    rec.lang = 'en-IN'; rec.interimResults = false;
    let listening = false;
    const off = () => { listening = false; micBtn.classList.remove('is-listening'); if (!busy) setState('idle'); };
    rec.onresult = e => {
      input.value = e.results[0][0].transcript;
      updateCounter();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    };
    rec.onend = off; rec.onerror = off;
    micBtn.addEventListener('click', () => {
      if (listening) { rec.stop(); return; }
      try { rec.start(); listening = true; micBtn.classList.add('is-listening'); setState('listening'); } catch (e) { }
    });
  }

  /* ---------- export / clear ---------- */
  $('nxExport').addEventListener('click', () => {
    if (!history.length) return;
    const lines = history.map(h => (h.role === 'user' ? 'You: ' : 'AI:  ') + h.content);
    const blob = new Blob(["Chat with Ayushman's portfolio AI\n" + new Date().toLocaleString() + '\n\n' + lines.join('\n\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'portfolio-ai-chat.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('nxClear').addEventListener('click', clearChat);

  /* ---------- restore ---------- */
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || '[]');
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
      showChips((last && last.meta && last.meta.suggestions) || startChips());
      settleScroll();
    } else showChips(startChips());
  } catch (e) { showChips(startChips()); }

  /* ---------- teaser bubble ---------- */
  $('nxTeaserClose').addEventListener('click', () => { teaser.hidden = true; try { sessionStorage.setItem(TEASE_KEY, '1'); } catch (e) { } });
  let seen = false;
  try { seen = !!sessionStorage.getItem(TEASE_KEY); } catch (e) { }
  if (!seen) {
    setTimeout(() => {
      if (panel.classList.contains('is-open')) return;
      teaserText.textContent = TEASERS[path] || "Ask me anything about Ayushman's work";
      teaser.hidden = false;
      setTimeout(() => { teaser.hidden = true; }, 12000);
    }, 9000);
  }

  /* ---------- projects page: highlight cards the AI pointed at (?highlight=a,b) ---------- */
  const highlight = (new URLSearchParams(location.search).get('highlight') || '').split(',').filter(Boolean);
  if (highlight.length) {
    document.querySelectorAll('.orbit-card[data-project-id]').forEach(card => {
      card.classList.add(highlight.includes(card.dataset.projectId) ? 'ai-highlight' : 'ai-dimmed');
    });
  }
})();