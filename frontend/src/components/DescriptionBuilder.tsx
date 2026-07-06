'use client';

import { useState } from 'react';
import { Copy, Download } from 'lucide-react';

const TEMPLATES = {
  single: `{song_title}
Artist: {artist_name}

🎵 Available on all platforms:
• Spotify: https://open.spotify.com/
• Apple Music: https://music.apple.com/
• YouTube Music: https://music.youtube.com/
• Deezer: https://www.deezer.com/

© 2024 {copyright_holder}
Distributed by {distributor}

Credits:
{credits}`,
  album: `{album_title}
By {artist_name}

🎵 Album Details:
{album_description}

📱 Listen on:
• Spotify: https://open.spotify.com/
• Apple Music: https://music.apple.com/
• YouTube Music: https://music.youtube.com/

© 2024 {copyright_holder}
Distributed by {distributor}

Credits:
{credits}`,
  mv: `{video_title}
Artist: {artist_name}

🎬 Official Music Video

📱 Listen to the audio:
• Spotify: https://open.spotify.com/
• Apple Music: https://music.apple.com/
• YouTube Music: https://music.youtube.com/

© 2024 {copyright_holder}
Distributed by {distributor}

Credits:
{credits}`,
};

interface DescBuilderState {
  template: keyof typeof TEMPLATES;
  song_title: string;
  artist_name: string;
  copyright_holder: string;
  distributor: string;
  credits: string;
  album_description: string;
  video_title: string;
}

export function DescriptionBuilder() {
  const [state, setState] = useState<DescBuilderState>({
    template: 'single',
    song_title: '',
    artist_name: '',
    copyright_holder: '',
    distributor: '',
    credits: '',
    album_description: '',
    video_title: '',
  });

  const generateDescription = () => {
    const template = TEMPLATES[state.template];
    return template
      .replace('{song_title}', state.song_title)
      .replace('{album_title}', state.song_title)
      .replace('{video_title}', state.video_title)
      .replace('{artist_name}', state.artist_name)
      .replace('{copyright_holder}', state.copyright_holder || 'Your Label')
      .replace('{distributor}', state.distributor || 'Your Distributor')
      .replace('{credits}', state.credits)
      .replace('{album_description}', state.album_description);
  };

  const description = generateDescription();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(description);
  };

  const downloadAsText = () => {
    const element = document.createElement('a');
    const file = new Blob([description], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${state.song_title || 'description'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6">
      {/* Template Selection */}
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-3">Template</label>
        <div className="grid grid-cols-3 gap-3">
          {(['single', 'album', 'mv'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setState({ ...state, template: t })}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                state.template === t
                  ? 'bg-green-600 text-white'
                  : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'
              }`}
            >
              {t === 'mv' ? 'Music Video' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase">
              {state.template === 'album' ? 'Album Title' : state.template === 'mv' ? 'Video Title' : 'Song Title'}
            </label>
            <input
              type="text"
              value={state.template === 'mv' ? state.video_title : state.song_title}
              onChange={(e) =>
                setState({
                  ...state,
                  [state.template === 'mv' ? 'video_title' : 'song_title']: e.target.value,
                })
              }
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:border-green-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase">Artist Name</label>
            <input
              type="text"
              value={state.artist_name}
              onChange={(e) => setState({ ...state, artist_name: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:border-green-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase">Copyright Holder</label>
            <input
              type="text"
              value={state.copyright_holder}
              onChange={(e) => setState({ ...state, copyright_holder: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:border-green-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase">Distributor</label>
            <input
              type="text"
              value={state.distributor}
              onChange={(e) => setState({ ...state, distributor: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:border-green-500 focus:outline-none"
            />
          </div>

          {state.template === 'album' && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase">Album Description</label>
              <textarea
                value={state.album_description}
                onChange={(e) => setState({ ...state, album_description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:border-green-500 focus:outline-none resize-none"
                placeholder="Album details, tracks, etc..."
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase">Credits</label>
            <textarea
              value={state.credits}
              onChange={(e) => setState({ ...state, credits: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:border-green-500 focus:outline-none resize-none"
              placeholder="Paste formatted credits here..."
            />
          </div>
        </div>

        {/* Live Preview */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-400 uppercase">Live Preview</label>
          <div className="w-full h-full min-h-96 bg-neutral-900 border border-neutral-700 rounded-lg p-4 overflow-y-auto">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
              {description || '(preview will appear here)'}
            </pre>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition font-medium text-sm"
        >
          <Copy size={16} /> Copy Description
        </button>
        <button
          onClick={downloadAsText}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-medium text-sm"
        >
          <Download size={16} /> Download TXT
        </button>
      </div>
    </div>
  );
}
