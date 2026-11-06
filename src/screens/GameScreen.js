import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Badge, Button, Chip, IconButton, NavBar, Page, T } from '../components/ui';
import { gameById, loadMemorySet, loadPairs, loadQuiz, loadWords } from '../games/catalog';
import FindDifferent from '../games/views/FindDifferent';
import G2048 from '../games/views/G2048';
import Matchstick from '../games/views/Matchstick';
import Maze from '../games/views/Maze';
import Memory from '../games/views/Memory';
import Mental from '../games/views/Mental';
import Quiz from '../games/views/Quiz';
import Reaction from '../games/views/Reaction';
import Schulte from '../games/views/Schulte';
import Simon from '../games/views/Simon';
import Slide from '../games/views/Slide';
import Stroop from '../games/views/Stroop';
import Sudoku from '../games/views/Sudoku';
import WordSearch from '../games/views/WordSearch';
import { SaveCtx } from '../games/views/shared';
import { useStore } from '../state/store';
import { useColors } from '../theme/tokens';

const VIEWS = { sudoku: Sudoku, wordsearch: WordSearch, finddiff: FindDifferent, matchstick: Matchstick, slide: Slide, memory: Memory, quiz: Quiz, maze: Maze, g2048: G2048, mental: Mental, stroop: Stroop, reaction: Reaction, schulte: Schulte, simon: Simon };

function loader(game, lang) {
  if (game.kind === 'quiz') return loadQuiz(game, lang);
  if (game.kind === 'wordsearch') return loadWords(lang);
  if (game.kind === 'finddiff') return loadPairs();
  if (game.kind === 'memory') return loadMemorySet();
  return null;
}

export default function GameScreen({ gameId, nav }) {
  const c = useColors();
  const { tr, lang, favorites, toggleFavorite, markPlayed, pickFresh, getProgress, saveProgress, clearProgress } = useStore();
  const game = gameById(gameId);
  const [round, setRound] = useState(0);
  const [data, setData] = useState(null);
  const [result, setResult] = useState(null);
  const saved = favorites.includes(game.id);
  const needsData = ['quiz', 'wordsearch', 'finddiff', 'memory'].includes(game.kind);

  // Puzzles keep their progress until they are finished. The timed challenge games start fresh every time.
  const resumable = game.type === 'puzzle';
  const snap = useRef(resumable ? getProgress(game.id) : null);
  const current = useRef(snap.current || {});
  const ended = useRef(false);
  const saveCtx = useMemo(() => (resumable ? {
    snap: snap.current,
    put: (key, value) => {
      if (ended.current) return;
      current.current = { ...current.current, [key]: value };
      saveProgress(game.id, current.current);
    },
  } : null), [round]);

  useEffect(() => {
    let alive = true;
    setData(null); setResult(null);
    if (snap.current && snap.current.data) { setData(snap.current.data); return undefined; }
    const p = loader(game, lang);
    if (p) p.then(d => { if (!alive) return; setData(d); if (saveCtx) saveCtx.put('data', d); });
    return () => { alive = false; };
  }, [round, gameId]);

  // A fresh puzzle: forget the saved one and load new questions.
  const startOver = () => {
    clearProgress(game.id);
    snap.current = null; current.current = {}; ended.current = false;
    setRound(r => r + 1);
  };
  const finish = r => { ended.current = true; clearProgress(game.id); markPlayed(game.id, r.won); setResult(r); };
  const View_ = VIEWS[game.kind];
  const name = tr(game.zh, game.en);

  return (
    <View style={{ flex: 1 }}>
      <NavBar title={name} backLabel={tr('返回', 'Back')} onBack={nav.back}
        right={<IconButton icon="heart" filled={saved} color={saved ? c.danger : c.accent} label={saved ? tr('取消收藏', 'Remove from saved') : tr('收藏', 'Save')} onPress={() => toggleFavorite(game.id)} />} />
      <Page>
        {result ? (
          <View style={{ alignItems: 'center', paddingTop: 28 }}>
            <Badge icon={result.won ? 'party' : game.icon} tone={result.won ? 'puzzle' : 'neutral'} size={96} />
            <T v="title" accessibilityRole="header" accessibilityLiveRegion="polite" style={{ marginTop: 18, textAlign: 'center' }}>{result.title}</T>
            <T v="body" color={c.secondary} style={{ marginTop: 4, textAlign: 'center' }}>{result.detail}</T>
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 26 }}>
              <Button icon="shuffle" title={tr('換一款新鮮的', 'Try Something New')} onPress={() => nav.replace('game', { id: pickFresh(game.id).id })} />
              <Button kind="secondary" icon="refresh" title={tr('再來一局', 'Play Again')} onPress={startOver} />
            </View>
          </View>
        ) : needsData && !data ? (
          <View style={{ alignItems: 'center', paddingTop: 80 }} accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={c.accent} />
            <T v="subhead" color={c.secondary} style={{ marginTop: 14 }}>{tr('正在準備新題目…', 'Getting fresh questions…')}</T>
          </View>
        ) : (
          <>
            {needsData && data.source && <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Chip tone={data.source === 'gemini' ? 'accent' : 'neutral'} text={data.source === 'gemini' ? tr('Gemini 出題', 'By Gemini') : tr('內建題庫', 'Built-in set')} /></View>}
            {!!snap.current && <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Chip tone="accent" text={tr('繼續上次的進度', 'Picking up where you left off')} /></View>}
            <SaveCtx.Provider value={saveCtx}>
              <View_ key={round} game={game} tr={tr} data={data} onFinish={finish} />
            </SaveCtx.Provider>
            {resumable && <Button style={{ marginTop: 22 }} kind="secondary" icon="refresh" title={tr('換一題', 'New puzzle')} onPress={startOver} />}
          </>
        )}
      </Page>
    </View>
  );
}
