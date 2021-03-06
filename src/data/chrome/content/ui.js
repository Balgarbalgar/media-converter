function $ (query, parent) {
  return (parent || document).querySelector(query);
}

/*
  events:
    'change-status'
    'change-progress'

*/
/*
var {require} = Components.utils.import('resource://gre/modules/commonjs/toolkit/require.js', {});
var tabs = require('sdk/tabs');
*/
var root = 'resource://jid1-kps5prgbntzslq-at-jetpack/';
var connect = Components.utils.import(root + 'data/shared/connect.jsm');
var background = connect.remote;

var prefs = background.utils.prefs;
var event = background.utils.event;
var l10n = background.utils.l10n;

/*
 *  progress module
 *  example:
 *  progress.emit('register', 'p1');
 *  progress.emit('register', 'p2');
 *  progress.emit('p1', 10);
 *  progress.emit('p2', 90);
 *  progress.emit('remove', 'p1');
 *  progress.emit('remove', 'p2');
 *  events: register, update
 */

var progress = (function () {
  var e = event(),
      xul0 = $('#progress'),
      xul1 = $('#progress label'),
      xul2 = $('#progress progressmeter'),
      percents = {},
      listeners = {},
      ids = [];
  e.on('register', function (id) {
    ids.push(id);
    listeners[id] = function (p) {
      percents[id] = +p || 0;
      e.emit('update');
    };
    e.on(id, listeners[id]);
  });
  function remove (id) {
    var index = ids.indexOf(id);
    if (index !== -1) {
      e.off(id, listeners[id]);
      ids.splice(index, 1);
      delete listeners[id];
      delete percents[id];

      e.emit('update');
    }
  }
  e.on('remove', remove);
  e.on('remove-all', function () {
    while (ids.length) {
      remove(ids[0]);
    }
  });
  e.on('update', function () {
    var val = ids.map(id => percents[id]).reduce((p, c) => p + (c || 0) / ids.length, 0);
    xul1.value = '[' + ids.length + ']';
    xul2.value = val;
    xul0.style.display = val ? '-moz-box' : 'none';
  });

  e.emit('update'); //hide progressbar on start
  return e;
})();

/*
 *  status module
 *  events: change, changed
 *  example: log.emit('change', 'msg', 1000)
 *  example: log.value = 'msg';
 */
var log = (function () {
  var e = event(),
      xul = $('#statusbar label'),
      val = '';

  e.on('change', function (msg, delay) {
    delay = +delay || 0;
    window.setTimeout(function () {
      xul.value = val = msg;
      e.emit('changed', msg);
    }, delay);
  });
  Object.defineProperty(e, 'value', {
    get: function () {
      return val;
    },
    set: function (v) {
      e.emit('change', v);
    }
  });

  return e;
})();

/*
 * app module
 * events: no-ffmpeg
 */
var app = event();
app.on('no-ffmpeg', function () {
  for (var i = 0; i < panel.length; i++) {
    if (panel.getId(i) !== 'ffmpeg') {
      panel.disable(i);
    }
  }
});
app.on('ffmpeg-installed', function () {
  for (var i = 0; i < panel.length; i++) {
    if (panel.getId(i) !== 'ffmpeg') {
      panel.enable(i);
    }
  }
  $('#ffmpeg textbox').value = background.utils.prefs.ffmpeg;
});

/*
 *  panel module
 *  events: select
 *  example: panel.index = 2;
 */
var panel = (function () {
  var tabs = $('#tabs').getElementsByTagName('button'),
      tabpanels = $('#tabpanels').getElementsByTagName('tabpanel'),
      e = event();

  function select (i) {
    tabs[i].setAttribute('active', 'true');
    [].filter.call(tabs, (t, j) => j !== i).forEach(function (tab) {
      tab.removeAttribute('active');
    });
    tabpanels[i].setAttribute('active', 'true');
    $('#tabpanels').selectedIndex = i;
    e.emit('select', i);
  }

  $('#tabs').addEventListener('command', function (e) {
    var i = [].indexOf.call(tabs, e.target);
    if (i !== -1) {
      select(i);
      prefs['_internal_panel'] = i;
    }
  });

  select(prefs['_internal_panel'] || 0);

  Object.defineProperty(e, 'index', {
    get: function () {
      return [].reduce.call(tabs, (p, c, j) => c.getAttribute('active') ? j : p, 0);
    },
    set: function (val) {
      select(val);
    }
  });
  e.enable = (i) => tabs[i].removeAttribute('disabled');
  e.disable = function (i) {
    tabs[i].setAttribute('disabled', true);
    if (i === panel.index) {
      var freeIndex = [].reduce.call(tabs, (p, c, j) => c.getAttribute('disabled') !== 'true' ? j : p, 0);
      select(freeIndex);
    }
  };
  e.length = tabs.length;
  e.getId = (i) => tabpanels[isNaN(i) ? e.index : i].getAttribute('id');
  Object.defineProperty(e, 'ids', {
    get: function () {
      return (new Array(tabs.length)).join(' ').split(' ').map((o, i) => e.getId(i));
    }
  });

  return e;
})();

/* drag & drop */
var drag = {
  checkDrag: function (event) {
    if ((+$('progressmeter').value) === 0 && panel.getId() !== 'ffmpeg') {
      var isFile = event.dataTransfer.types.contains('application/x-moz-file');
      var isURL = event.dataTransfer.getData('URL') || event.dataTransfer.getData('text/x-moz-url');
      if (isFile || isURL) {
        event.preventDefault();
      }
    }
  },
  doDrop: function (event) {
    if (event.dataTransfer.types.contains('application/x-moz-file')) {
      var files = [];
      var dt = event.dataTransfer;
      for (var i = 0; i < dt.mozItemCount; i++) {
        var file = dt.mozGetDataAt('application/x-moz-file', i);
        if (file instanceof Components.interfaces.nsIFile) {
          files.push(file);
        }
      }
      conversions(files);
    }
    else {
      var link = event.dataTransfer.getData('URL') || event.dataTransfer.getData('text/x-moz-url');
      download(link);
    }
  }
};

/* notification center
 * events: no-ffmpeg, ffmpeg-installation-failed, ffmpeg-installation-succeeded, installing-ffmpeg
 */
function installFFmpeg () {
  app.emit('installing-ffmpeg');
  log.value = l10n('installingffmpeg');
  progress.emit('register', 'download-ffmpeg');
  connect.remote.register('install-ffmpeg', (function () {
    function c(o) {
      app.emit(handleError(o) ? 'ffmpeg-installation-failed' : 'ffmpeg-installation-succeeded');
      progress.emit('remove', 'download-ffmpeg');
      log.value = l10n('done');
      canOperate();
    }
    c.listener = {
      progress: function (p) {
        progress.emit('download-ffmpeg', p + 10);
      }
    };
    return c;
  })());
}

app.on('no-ffmpeg', function () {
  var notificationbox = $('notificationbox');
  var buttons = [{
    label: l10n('proceed.label'),
    accessKey: l10n('proceed.accesskey'),
    callback: installFFmpeg
  }];
  notificationbox.appendNotification(
    l10n('msg.no_ffmpeg'),
    'no_ffmpeg_installed',
    root + 'data/images/notification-critical.png',
    notificationbox.PRIORITY_CRITICAL_HIGH, buttons
  );
});
app.on('ffmpeg-installed', function () {
  $('notificationbox').removeAllNotifications();
});
function canOperate () {
  connect.remote.register('can-operate', function (result) {
    if (result.__proto__.toString() === 'Error') {
      app.emit('no-ffmpeg');
    }
    else {
      $('#ffmpeg textbox').value = background.utils.prefs.ffmpeg;
      app.emit('ffmpeg-installed');
    }
  });
}
canOperate();

/* user interactions */
// toMP3
$('#toMP3 textbox').addEventListener('change', function () {
  prefs.toMP3 = this.value;
}, false);
$('#toMP3 button').addEventListener('command', function () {
  background.utils.reset('toMP3');
  $('#toMP3 textbox').value = prefs.toMP3;
}, false);
$('#toMP3 textbox').value = prefs.toMP3 || '';
(function (vbitrate) {
  vbitrate.selectedIndex = prefs.vbitrate || 0;
  vbitrate.addEventListener('select', function () {
    prefs.vbitrate = vbitrate.selectedIndex;
  });
})($('#toMP3 radiogroup').getElementsByTagName('menulist')[0]);
(function (cbitrate) {
  cbitrate.selectedIndex = prefs.cbitrate || 0;
  cbitrate.addEventListener('select', function () {
    prefs.cbitrate = cbitrate.selectedIndex;
  });
})($('#toMP3 radiogroup').getElementsByTagName('menulist')[1]);
(function (mquality) {
  mquality.selectedIndex = prefs.mquality || 0;
  mquality.addEventListener('select', function () {
    prefs.mquality = mquality.selectedIndex;
  });
})($('#toMP3 radiogroup'));
(function (checkbox) {
  checkbox.checked = prefs.mp3Delete;
  checkbox.addEventListener('click', function () {
    prefs.mp3Delete = checkbox.checked;
  });
})($('#toMP3 checkbox'));

//toAudio
$('#toAudio textbox').addEventListener('change', function () {
  prefs.toAudio = this.value;
}, false);
$('#toAudio button').addEventListener('command', function () {
  background.utils.reset('toAudio');
  $('#toAudio textbox').value = prefs.toAudio;
}, false);
$('#toAudio textbox').value = prefs.toAudio || '';

//toCombined
$('#toCombined textbox').addEventListener('change', function () {
  prefs.toCombined = this.value;
}, false);
$('#toCombined button').addEventListener('command', function () {
  background.utils.reset('toCombined');
  $('#toCombined textbox').value = prefs.toCombined;
}, false);
$('#toCombined textbox').value = prefs.toCombined || '';

// volume
$('#volume textbox').addEventListener('change', function () {
  prefs.volume = this.value;
}, false);
$('#volume button').addEventListener('command', function () {
  background.utils.reset('volume');
  $('#volume textbox').value = prefs.volume;
}, false);
$('#volume textbox').value = prefs.volume || '';
(function (vascale) {
  vascale.addEventListener('change', function () {
    prefs.vascale = vascale.value + '';
    $('#volume-percent').value = (vascale.value / 10 * 100).toFixed(0) + '%';
  });
  vascale.value = prefs.vascale || '12';
  var evt = document.createEvent('Events');
  evt.initEvent('change', true, true);
  vascale.dispatchEvent(evt);
})($('#volume scale'));

// scale
$('#scale textbox').addEventListener('change', function () {
  prefs.scale = this.value;
}, false);
(function (mbscale) {
  mbscale.addEventListener('change', function () {
    prefs.mbscale = mbscale.value + '';
    $('#multiply-by-label').value = mbscale.value;
  });
  mbscale.value = prefs.mbscale || '2';
  var evt = document.createEvent('Events');
  evt.initEvent('change', true, true);
  mbscale.dispatchEvent(evt);
})($('#multiply-by-scale'));
(function (dbscale) {
  dbscale.addEventListener('change', function () {
    prefs.dbscale = dbscale.value + '';
    $('#divide-by-label').value = dbscale.value;
  });
  dbscale.value = prefs.dbscale || '1';
  var evt = document.createEvent('Events');
  evt.initEvent('change', true, true);
  dbscale.dispatchEvent(evt);
})($('#divide-by-scale'));
$('#scale button').addEventListener('command', function () {
  background.utils.reset('scale');
  $('#scale textbox').value = prefs.scale;
}, false);
$('#scale textbox').value = prefs.scale || '';

//rotate
$('#rotate textbox').addEventListener('change', function () {
  prefs.rotate = this.value;
}, false);
$('#rotate button').addEventListener('command', function () {
  background.utils.reset('rotate');
  $('#rotate textbox').value = prefs.rotate;
}, false);
$('#rotate textbox').value = prefs.rotate || '';
(function (vora) {
  vora.selectedIndex = prefs.vora || 0;
  vora.addEventListener('select', function () {
    prefs.vora = vora.selectedIndex;
  });
})($('#rotate radiogroup'));

//shift
$('#shift textbox').addEventListener('change', function () {
  prefs.shift = this.value;
}, false);
$('#shift button').addEventListener('command', function () {
  background.utils.reset('shift');
  $('#shift textbox').value = prefs.shift;
}, false);
$('#shift textbox').value = prefs.shift || '';
(function (forward) {
  forward.selectedIndex = prefs.forward || 0;
  forward.addEventListener('select', function () {
    prefs.forward = forward.selectedIndex;
  });
})($('#shift radiogroup'));

//cut
$('#cut textbox').addEventListener('change', function () {
  prefs.cut = this.value;
}, false);
$('#cut button').addEventListener('command', function () {
  background.utils.reset('cut');
  $('#cut textbox').value = prefs.cut;
}, false);
$('#cut textbox').value = prefs.cut || '';

//ffmpeg
$('#ffmpeg textbox').addEventListener('change', function () {
  prefs.ffmpeg = this.value;
}, false);
$('#ffmpeg button[data-type=browse]').addEventListener('command', function () {
  var file = background.utils.file.browse();
  if (file) {
    $('#ffmpeg textbox').value = file.path;
    // make sure 'onchange' is fired
    $('#ffmpeg textbox').dispatchEvent(new Event('change'));
  }
}, false);
$('#ffmpeg button[data-type=settings]').addEventListener('click', function () {
  background.utils.windows.openOptions();
}, false);
$('#ffmpeg textbox').addEventListener('click', function () {
  $('#ffmpeg button').doCommand();
}, false);
$('#ffmpeg textbox').value = prefs.ffmpeg || '';
$('#ffmpeg button[data-type=download]').addEventListener('command', installFFmpeg, false);

function handleError (e) {
  if (e.__proto__.toString() === 'Error') {
    background.utils.notify(l10n('error'), e.message);
    return true;
  }
  return false;
}
// Conversions
var conversions = (function () {
  return function (files) {
    if (!files.length) {
      return;
    }
    files.forEach(file => progress.emit('register', file.path));

    var action = panel.getId();
    switch (action) {
    case 'toMP3':
    case 'toAudio':
    case 'volume':
    case 'scale':
    case 'rotate':
    case 'shift':
    case 'cut':
      function doOne () {
        var file = files.shift();
        log.emit('change', l10n('workingon') + ' ' + file.path);

        function callback (result) {
          if (!files.length) {
            progress.emit('remove-all');
            log.emit('change', l10n('done'), 1000);
          }
          else {
            doOne();
          }
          handleError(result);
        }
        callback.listener = {
          progress: p => progress.emit(file.path, p)
        };
        var quality;
        if ($('#toMP3 radiogroup').selectedIndex === 0) {  //VBR
          quality = '-q:a ' + $('#toMP3 radiogroup').getElementsByTagName('menulist')[0].selectedIndex;
        }
        else {  //Non VBR
          quality = '-b:a ' + $('#toMP3 radiogroup').getElementsByTagName('menulist')[1].selectedItem.value;
        }
        var angle = ['90', '180', '270'][$('#rotate radiogroup').selectedIndex];
        var direction = ['v', 'a'][$('#shift radiogroup').selectedIndex];
        var shift = $('#shift radiogroup').parentNode.querySelector('textbox').value;
        var kill = $('#toMP3 checkbox').checked;
        var frm = $('#cut [data-type="from"]').value;
        var to = $('#cut [data-type="to"]').value;

        callback.quality = quality;
        callback.angle = angle;
        callback.kill = kill;
        callback.direction = direction;
        callback.shift = shift;
        callback.from = frm;
        callback.to = to;
        callback.audio = file.path;
        callback.level = $('#volume scale').value / 10;
        callback.divide = $('#divide-by-scale').value;
        callback.multiply = $('#multiply-by-scale').value;

        connect.remote.register([
            'mp3-conversion',
            'audio-muxing',
            'volume-adjusting',
            'scale-video',
            'rotate-video',
            'shift-video-or-audio',
            'cut-video-or-audio'
          ][['toMP3', 'toAudio', 'volume', 'scale', 'rotate', 'shift', 'cut'].indexOf(action)],
          callback
        );
      }
      doOne();
      break;
    case 'toCombined':
      if (files.length === 2) {
        log.emit('change', l10n('workingon') + ' ' + files[0].path);
        progress.emit('register', 'toCombined');
        function callback (result) {
          log.emit('change', l10n('done'), 1000);
          progress.emit('remove', 'toCombined');
          handleError(result);
        }
        files = files.sort(function (f1) {
          return /\.(m4a|ogg|opus)$/i.test(f1.path) ? 1 : -1;
        });
        callback.listener = {
          progress: p => progress.emit('toCombined', p)
        };
        callback.video = files[0].path;
        callback.audio = files[1].path;
        connect.remote.register('audio-video-mixing', callback);
      }
      else {
        background.utils.notify(l10n('error'), l10n('msg.input_not_enough'));
      }
      break;
    default:
      throw Error('ui.js -> conversions -> no action is supported on settings tab');
    }
  };
})();

var download = (function () {
  return function (link) {
    if (link.indexOf('youtube.com/watch') !== -1) {
      return alert(l10n('msg.nodownloader'))
    }
    var file = background.utils.file.browse(null, 'save');
    function callback () {}
    if (file) {
      log.emit('change', l10n('downloading') + ' ' + link);
      callback.file = file;
      callback.url = link;
      progress.emit('register', 'download');
      callback.listener = {
        progress: p => progress.emit('download', p),
        done: function () {
          progress.emit('remove', 'download');
          conversions([file]);
        },
        error: function () {
          progress.emit('remove', 'download');
          log.emit('change', l10n('downloadcancelled'), 1000);
        }
      };
      connect.remote.register('download-media', callback);
    }
  };
})();

document.getElementById('abort').addEventListener('command', function () {
  if (confirm('Are you sure you want to kill FFmpeg process?')) {
    connect.remote.register('kill-ffmpeg');
  }
})
