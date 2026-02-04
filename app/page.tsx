'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/utils/supabase';
import {
  Music, Upload, HeadphoneOff, Heart, Trash2, Search, Play, Flame, X,
  MessageSquare, CornerDownRight, Plus, Minus, LayoutGrid, Folder, Edit2, ArrowUp, Lock, SearchX, Music2, Smile
} from 'lucide-react';
import { User } from "@supabase/supabase-js";

// --- 1. 타입 정의 (기존 이름 유지) ---
interface Post { id: number; title: string; artist: string; description: string; youtube_id?: string; likes: number; views?: number; mood: string; genre: string; isLiked?: boolean; }
interface Playlist { id: number; name: string; created_at: string; } // 에러 방지를 위해 복구
interface PlaylistFolder { id: number; name: string; user_id: string; created_at: string; }
interface UserPlaylistItem { id: number; user_id: string; post_id: number; folder_id: number; created_at: string; music_posts?: { id: number; title: string; artist: string; }; }
interface UserProfile { id: string; name: string; avatar_url: string | null; comment_count: number; }
interface Comment { id: string; post_id: number; content: string; created_at: string; parent_id: string | null; user_id?: string; likes_count?: number; updated_at?: string; profiles?: { name?: string; avatar_url?: string; } | null; isLiked?: boolean; }

// --- 2. 애니메이션 하트 컴포넌트 ---
const AnimatedHeart = ({ isLiked, size = 14 }: { isLiked: boolean; size?: number }) => (
  <div className="relative inline-flex items-center justify-center">
    <AnimatePresence>
      {isLiked && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
              animate={{
                scale: [0, 1, 0],
                x: Math.cos(i * 60 * Math.PI / 180) * 25,
                y: Math.sin(i * 60 * Math.PI / 180) * 25,
                opacity: 0
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute w-1 h-1 bg-pink-400 rounded-full"
            />
          ))}
        </div>
      )}
    </AnimatePresence>
    <motion.div whileHover={{ scale: 1.25 }} whileTap={{ scale: 0.8 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}>
      <Heart size={size} className={`transition-colors duration-300 ${isLiked ? "fill-pink-500 text-pink-500" : "text-slate-500"}`}
        style={{ filter: isLiked ? "drop-shadow(0 0 8px rgba(236, 72, 153, 0.7))" : "none" }} />
    </motion.div>
  </div>
);

// --- 3. 서브 컴포넌트: 댓글 아이템 ---
const CommentItem = ({
  c, user, isReply = false, onReply, onDelete, onEdit, onLike, onProfileClick, formatTime, parseTimestamps
}: {
  c: Comment, user: User | null, isReply?: boolean, onReply?: (c: Comment) => void, onDelete: (id: string) => void,
  onEdit: (c: Comment) => void, onLike: (id: string, score: number) => void, onProfileClick: (e: any, userId: string) => void,
  formatTime: (str: string) => string, parseTimestamps: (content: string) => any
}) => (
  <div className={`${isReply ? 'ml-6 mt-2 flex gap-2 group/reply' : 'mb-4 group/comment'}`}>
    {isReply && <CornerDownRight size={12} className="text-slate-500 mt-1 shrink-0" />}
    <div className={`flex-1 p-4 rounded-xl border border-slate-800/50 ${isReply ? 'bg-[#16161a]' : 'bg-[#1a1a1e] shadow-sm'}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shrink-0 overflow-hidden">
          {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} className="w-full h-full object-cover" /> : <span className="text-white text-[10px] font-black">{c.profiles?.name?.[0] || 'U'}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-purple-400 cursor-pointer" onClick={(e) => onProfileClick(e, c.user_id || '')}>{c.profiles?.name || '익명'}</span>
            <span className="text-[8px] text-slate-500">{formatTime(c.created_at)}</span>
            {c.updated_at && <span className="text-[7px] text-blue-400">수정됨</span>}
          </div>
          <p className={`${isReply ? 'text-[10px]' : 'text-sm'} text-slate-200`}>{parseTimestamps(c.content)}</p>
          <div className="mt-2 flex items-center gap-4">
            {!isReply && <button onClick={() => onReply?.(c)} className="text-[8px] text-purple-400 font-black">답글 달기</button>}
            <button onClick={() => onLike(c.id, Number(c.likes_count))} className="flex items-center gap-1 text-[8px] text-pink-400 font-black">
              <AnimatedHeart isLiked={!!c.isLiked} size={10} />
              {c.likes_count || 0}
            </button>
            {user?.id === c.user_id && (
              <div className={`flex gap-2 ml-auto transition-opacity ${isReply ? 'opacity-0 group-hover/reply:opacity-100' : 'opacity-0 group-hover/comment:opacity-100'}`}>
                <button onClick={() => onDelete(c.id)} className="text-[8px] text-red-400 font-black">삭제</button>
                <button onClick={() => onEdit(c)} className="text-[8px] text-blue-400 font-black">수정</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// --- 4. 댓글 섹션 ---
function CommentSection({ postId, user, currentPost, onSeekToTime }: {
  postId: number, user: User | null, currentPost: Post | null, onSeekToTime?: (seconds: number) => void
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [profilePopupPosition, setProfilePopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojis = ['😊', '😍', '😂', '🥰', '😎', '😭', '😱', '🧐', '👍', '🔥', '❤️', '✨', '🎵', '🎶', '👏', '🙌', '🥳', '🌈', '🍀', '💯'];

  const handleEmojiClick = (emoji: string) => {
    if (!inputRef.current) return;
    const start = inputRef.current.selectionStart || 0;
    const end = inputRef.current.selectionEnd || 0;
    const text = newComment;
    const before = text.substring(0, start);
    const after = text.substring(end);
    setNewComment(before + emoji + after);

    // 포커스 유지 및 커서 위치 조정
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = start + (emoji.length > 2 ? 1 : emoji.length); // Handle multi-char emojis if needed, usually emoji.length is fine for most
        inputRef.current.setSelectionRange(start + emoji.length, start + emoji.length);
      }
    }, 0);
  };

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('music_comments')
      .select('id, content, created_at, post_id, user_id, parent_id, author:profiles!user_id(name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error || !data) return;

    let userLikedCommentIds: string[] = [];
    if (user) {
      const { data: likedData } = await supabase.from('comment_likes').select('comment_id').eq('user_id', user.id);
      userLikedCommentIds = likedData?.map(l => String(l.comment_id)) || [];
    }

    const commentsWithCounts = await Promise.all(data.map(async (c: any) => {
      const { count } = await supabase.from('comment_likes').select('*', { count: 'exact', head: true }).eq('comment_id', c.id);
      return { ...c, profiles: (c as any).author, likes_count: count || 0, isLiked: userLikedCommentIds.includes(String(c.id)) };
    }));
    setComments(commentsWithCounts as Comment[]);
  };

  useEffect(() => {
    fetchComments();
  }, [postId, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;
    const { error } = await supabase.from('music_comments').insert([{ post_id: postId, content: newComment, user_id: user.id, parent_id: replyTo?.id || null }]);
    if (!error) { setNewComment(''); setReplyTo(null); fetchComments(); }
  };

  const deleteComment = async (id: string) => {
    if (confirm('삭제하시겠습니까?')) { await supabase.from('music_comments').delete().eq('id', id); fetchComments(); }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!user) return alert('로그인이 필요한 기능입니다.');
    const { data: existing } = await supabase.from('comment_likes').select().eq('comment_id', commentId).eq('user_id', user.id).maybeSingle();
    if (existing) {
      await supabase.from('comment_likes').delete().eq('id', (existing as any).id);
    } else {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
    }
    fetchComments();
  };

  const handleSaveEdit = async () => {
    if (!user || !editingComment || !editContent.trim()) return;
    const { error } = await supabase.from('music_comments').update({ content: editContent.trim(), updated_at: new Date().toISOString() }).eq('id', editingComment).eq('user_id', user.id);
    if (!error) { setEditingComment(null); fetchComments(); }
  };

  const formatTime = (str: string) => {
    const diff = Math.floor((Date.now() - new Date(str).getTime()) / 1000);
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${new Date(str).getMonth() + 1}/${new Date(str).getDate()}`;
  };

  const parseTimestamps = (content: string) => {
    const parts = content.split(/(\d{1,2}:\d{2})/g);
    return parts.map((part, i) => part.match(/^\d{1,2}:\d{2}$/) ? (
      <button key={i} onClick={() => onSeekToTime?.(parseInt(part.split(':')[0]) * 60 + parseInt(part.split(':')[1]))} className="text-purple-400 font-black text-xs underline mx-1 hover:text-purple-300">{part}</button>
    ) : part);
  };

  return (
    <div className="mt-6 pt-4 border-t border-slate-800/30" onClick={() => setSelectedProfile(null)}>
      <div className="space-y-4 mb-4 max-h-60 overflow-y-auto no-scrollbar px-1">
        {comments.filter(c => !c.parent_id).map(c => (
          <div key={c.id}>
            {editingComment === c.id ? (
              <div className="bg-[#1a1a1e] p-4 rounded-xl border border-purple-500/30 mb-4 space-y-2">
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full p-2 bg-black border border-purple-500/30 rounded text-sm text-slate-200" rows={2} />
                <div className="flex gap-2">
                  <button onClick={handleSaveEdit} className="px-3 py-1 bg-purple-600 text-white text-[10px] font-black rounded">저장</button>
                  <button onClick={() => setEditingComment(null)} className="px-3 py-1 bg-slate-600 text-white text-[10px] font-black rounded">취소</button>
                </div>
              </div>
            ) : (
              <CommentItem c={c} user={user} onReply={setReplyTo} onDelete={deleteComment} onEdit={(c) => { setEditingComment(c.id); setEditContent(c.content); }} onLike={handleLikeComment} formatTime={formatTime} parseTimestamps={parseTimestamps} onProfileClick={(e, userId) => {
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                setProfilePopupPosition({ x: rect.left + window.scrollX + rect.width / 2, y: rect.top + window.scrollY - 10 });
                supabase.from('profiles').select('id, name, avatar_url, music_comments(count)').eq('id', userId).single().then(({ data }) => data && setSelectedProfile({ id: data.id, name: data.name, avatar_url: data.avatar_url, comment_count: (data.music_comments as any).length }));
              }} />
            )}
            {comments.filter(r => r.parent_id === c.id).map(reply => (
              <CommentItem key={reply.id} c={reply} user={user} isReply onDelete={deleteComment} onEdit={(c) => { setEditingComment(c.id); setEditContent(c.content); }} onLike={handleLikeComment} formatTime={formatTime} parseTimestamps={parseTimestamps} onProfileClick={(e, userId) => {
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                setProfilePopupPosition({ x: rect.left + window.scrollX + rect.width / 2, y: rect.top + window.scrollY - 10 });
                supabase.from('profiles').select('id, name, avatar_url, music_comments(count)').eq('id', userId).single().then(({ data }) => data && setSelectedProfile({ id: data.id, name: data.name, avatar_url: data.avatar_url, comment_count: (data.music_comments as any).length }));
              }} />
            ))}
          </div>
        ))}
      </div>

      {/* 프로필 팝업 */}
      {selectedProfile && profilePopupPosition && (
        <div className="fixed z-[9999] bg-[#1a1a1e] border border-purple-500/30 rounded-lg shadow-xl p-4 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ left: `${profilePopupPosition.x}px`, top: `${profilePopupPosition.y}px`, transform: 'translateX(-50%) translateY(-100%)' }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-3">
            <Link href={`/profile/${selectedProfile.id}`} className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity overflow-hidden">
              {selectedProfile.avatar_url ? <img src={selectedProfile.avatar_url} alt="profile" className="w-full h-full object-cover" /> : <span className="text-white text-sm font-black">{selectedProfile.name?.charAt(0) || 'U'}</span>}
            </Link>
            <div className="min-w-0">
              <Link href={`/profile/${selectedProfile.id}`} className="hover:text-purple-400 transition-colors block">
                <h3 className="text-sm font-semibold text-slate-200 truncate">{selectedProfile.name}</h3>
              </Link>
              <p className="text-xs text-slate-500">댓글 {selectedProfile.comment_count}개</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5">
            <Link href={`/profile/${selectedProfile.id}`} className="w-full py-2 bg-gradient-to-r from-purple-600/20 to-blue-600/20 hover:from-purple-600/40 hover:to-blue-600/40 border border-purple-500/30 rounded-lg text-[10px] font-black text-purple-300 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">프로필 보기</Link>
          </div>
        </div>
      )}

      {user ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          {replyTo && (
            <div className="flex items-center justify-between bg-purple-500/10 p-2 rounded-lg border border-purple-500/20 animate-pulse">
              <span className="text-[9px] text-purple-600 font-bold flex items-center gap-1"><MessageSquare size={10} /> "{replyTo.content.substring(0, 10)}..." 님께 답글 작성 중</span>
              <button type="button" onClick={() => setReplyTo(null)}><X size={12} className="text-purple-600" /></button>
            </div>
          )}
          {showEmojiPicker && (
            <div className="grid grid-cols-10 gap-1 mb-2 px-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {emojis.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="text-lg hover:bg-white/20 rounded-lg transition-all p-1.5 flex items-center justify-center filter hover:brightness-125 focus:outline-none"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2 rounded-xl transition-all ${showEmojiPicker ? 'bg-purple-600/20 text-purple-400' : 'bg-slate-800/10 text-slate-500 hover:text-purple-400'}`}
              title="이모티콘"
            >
              <Smile size={20} />
            </button>
            <input
              ref={inputRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={replyTo ? "답글을 입력하세요..." : "따뜻한 감상평을 남겨주세요..."}
              className="flex-1 bg-white p-3 rounded-xl text-[11px] text-black border border-slate-300 outline-none focus:ring-2 focus:ring-purple-500/20"
            />
            <button type="submit" className="bg-purple-600 text-white px-5 py-2 rounded-xl text-[11px] font-black hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/20">등록</button>
          </div>
        </form>
      ) : (
        <div className="bg-[#0a0a0c]/50 p-4 rounded-xl border border-dashed border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-bold">댓글을 남기려면 <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })} className="text-purple-400 underline underline-offset-2 hover:text-purple-300">로그인</button>이 필요합니다.</p>
        </div>
      )}
    </div>
  );
}

// --- 5. 서브 컴포넌트: 검색어 하이라이트 ---
const HighlightText = ({ text, query }: { text: string, query: string }) => {
  if (!query) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <span>{parts.map((part, i) => part.toLowerCase() === query.toLowerCase() ? <mark key={i} className="bg-purple-500/30 text-purple-400 bg-transparent p-0">{part}</mark> : part)}</span>
  );
};

// --- 6. 서브 컴포넌트: 포스트 카드 ---
const PostCard = ({
  post, user, currentPlayingId, activeYoutube, editingId, editDesc,
  handlePlayAndScroll, handleAddToPlaylist, handleRemoveFromPlaylist,
  handleDeletePost, handleUpdateDesc, setEditingId, setEditDesc,
  handleLike, searchTerm, selectedPlaylist, postRefs
}: any) => (
  <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out">
    <article
      ref={el => { postRefs.current[post.id] = el }}
      className={`bg-[#141418] rounded-[2.5rem] border transition-all duration-700 ${currentPlayingId === post.id ? "border-purple-500/40 shadow-2xl scale-[1.02]" : "border-slate-800"}`}
    >
      {post.youtube_id && (
        <div className="aspect-video relative overflow-hidden group rounded-t-[2.5rem]">
          {activeYoutube.includes(post.id) ? (
            <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${post.youtube_id}?autoplay=1&enablejsapi=1`} allow="autoplay" allowFullScreen />
          ) : (
            <div className="absolute inset-0 bg-[#0a0a0c]/60 flex items-center justify-center cursor-pointer" onMouseDown={() => handlePlayAndScroll(post)}>
              <div className="relative flex items-center justify-center w-16 h-16 bg-[#8b3dff] rounded-full shadow-[0_0_20px_rgba(139,61,255,0.4)] hover:scale-110 transition-transform">
                <Play size={32} className="text-white fill-current transform translate-x-[2px]" />
              </div>
              <img src={`https://img.youtube.com/vi/${post.youtube_id}/maxresdefault.jpg`} className="absolute inset-0 -z-10 w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-700" />
            </div>
          )}
        </div>
      )}
      <div className="p-8">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className={`text-2xl font-black tracking-tight ${currentPlayingId === post.id ? "text-purple-400" : "text-white"}`}>
                <HighlightText text={post.title} query={searchTerm} />
              </h3>
              {currentPlayingId === post.id && <span className="text-[9px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-black animate-pulse">NOW PLAYING</span>}
            </div>
            <div className="flex gap-2">
              <span className="text-[9px] px-2 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 font-black uppercase">{post.mood}</span>
              <span className="text-[9px] px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-black uppercase">{post.genre}</span>
            </div>
            <p className="text-slate-500 text-sm font-bold italic">{post.artist}</p>
          </div>
          <div className="flex gap-2">
            {user && (
              <button onClick={() => handleAddToPlaylist(post.id)} className="p-2 text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-all" title="플레이리스트에 추가">
                <Plus size={16} />
              </button>
            )}
            {user && selectedPlaylist && (
              <button onClick={() => handleRemoveFromPlaylist(post.id)} className="p-2 text-slate-400 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-all" title="플레이리스트에서 제거">
                <Minus size={16} />
              </button>
            )}
            <button onClick={() => handleDeletePost(post.id)} className="p-3 rounded-2xl bg-[#0a0a0c] text-slate-700 hover:text-red-500 border border-slate-800 transition-all">
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        <div className="mb-6">
          {editingId === post.id ? (
            <div className="space-y-2 animate-in fade-in duration-300">
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full bg-[#0a0a0c] rounded-xl p-3 text-sm text-slate-300 border border-purple-500/50 outline-none min-h-[80px] resize-none" placeholder="곡 소개를 입력하세요..." />
              <div className="flex justify-between items-center">
                <button onClick={() => confirm('소개글을 삭제하시겠습니까?') && handleUpdateDesc(post.id, '')} className="text-[10px] font-black text-red-500/70 hover:text-red-500 transition-colors">삭제하기</button>
                <div className="flex gap-3">
                  <button onClick={() => setEditingId(null)} className="text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors">취소</button>
                  <button onClick={() => handleUpdateDesc(post.id, editDesc)} className="text-[10px] font-black text-purple-400 hover:text-purple-300 transition-colors">저장하기</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="group/desc relative">
              <p className="text-slate-400 text-sm italic border-l-4 border-purple-500/20 pl-4 py-1 leading-relaxed">{post.description ? `"${post.description}"` : '"소개글이 없습니다. 내용을 추가해보세요!"'}</p>
              <button onClick={() => { setEditingId(post.id); setEditDesc(post.description || ''); }} className="absolute top-0 right-0 opacity-0 group-hover/desc:opacity-100 text-[9px] font-black text-slate-600 hover:text-purple-400 transition-all">수정</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
          <div className="flex items-center gap-1"><Play size={12} /> {post.views || 0} VIEWS</div>
          <button onClick={() => handleLike(post.id, post.likes)} className="flex items-center gap-1 hover:text-pink-500 transition-colors group">
            <AnimatedHeart isLiked={!!post.isLiked} size={14} />
            <span>{post.likes || 0} SCORE</span>
          </button>
        </div>
        <CommentSection postId={post.id} user={user} currentPost={post} onSeekToTime={(seconds) => {
          if (typeof window !== 'undefined') {
            const iframes = document.querySelectorAll('iframe[src*="youtube"]');
            iframes.forEach((iframe: any) => {
              if (iframe.contentWindow) {
                iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }), '*');
              }
            });
          }
        }} />
      </div>
    </article>
  </div>
);

export default function MichidaUltimateFinalFix() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedMood, setSelectedMood] = useState('전체');
  const [selectedGenre, setSelectedGenre] = useState('🌐 전체');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPlayingId, setCurrentPlayingId] = useState<number | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<Post[]>([]);
  const [myPlaylist, setMyPlaylist] = useState<UserPlaylistItem[]>([]);
  const [activeYoutube, setActiveYoutube] = useState<number[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistFolders, setPlaylistFolders] = useState<PlaylistFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<number | null>(null);
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);
  const [targetPostId, setTargetPostId] = useState<number | null>(null);
  const [showTopButton, setShowTopButton] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPlaylists();
      fetchPlaylistFolders();
      fetchMyPlaylist();
    } else {
      setPlaylists([]);
      setPlaylistFolders([]);
      setSelectedFolderId(null);
      setSelectedPlaylist(null);
      setMyPlaylist([]);
    }
  }, [user]);

  useEffect(() => {
    fetchPosts();
  }, []); // Only fetch once or when user changes

  useEffect(() => {
    const handleShowButton = () => {
      if (window.scrollY > 500) {
        setShowTopButton(true);
      } else {
        setShowTopButton(false);
      }
    };

    window.addEventListener("scroll", handleShowButton);
    return () => window.removeEventListener("scroll", handleShowButton);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  const handleFolderClick = (folderId: number) => {
    if (selectedFolderId === folderId) {
      setSelectedFolderId(null);
    } else {
      setSelectedFolderId(folderId);
    }
  };

  const handleClearFolderFilter = () => {
    setSelectedFolderId(null);
  };

  const fetchPlaylistFolders = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('playlist_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setPlaylistFolders(data || []);
  };

  const handleCreateFolder = async () => {
    const name = prompt("새 폴더 이름을 입력하세요:");
    if (!name || !user) return;
    const { error } = await supabase
      .from('playlist_folders')
      .insert([{ name, user_id: user.id }]);
    if (!error) fetchPlaylistFolders();
  };

  const handleUpdateFolderName = async (id: number, oldName: string) => {
    const newName = prompt("수정할 폴더 이름을 입력하세요:", oldName);
    if (!newName || newName === oldName) return;
    const { error } = await supabase.from('playlist_folders').update({ name: newName }).eq('id', id);
    if (!error) fetchPlaylistFolders();
  };

  const handleDeleteFolder = async (id: number) => {
    const folderName = playlistFolders.find(f => f.id === id)?.name || '이 폴더';
    if (!confirm(`정말 이 폴더를 삭제하시겠습니까?\n(폴더만 삭제되며, 담겨있던 곡들은 보존됩니다.)`)) return;
    const { error } = await supabase.from('playlist_folders').delete().eq('id', id);
    if (!error) {
      if (selectedFolderId === id) {
        setSelectedFolderId(null);
      }
      await supabase.from('user_playlists').delete().eq('folder_id', id);
      fetchPlaylistFolders();
      fetchMyPlaylist();
    }
  };

  const fetchPlaylists = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('playlists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setPlaylists(data || []);
  };

  const handleCreatePlaylist = async () => {
    const name = prompt("새 플레이리스트 이름을 입력하세요:");
    if (!name || !user) return;
    const { error } = await supabase
      .from('playlists')
      .insert([{ name, user_id: user.id }])
      .select();
    if (!error) fetchPlaylists();
  };

  const handleUpdatePlaylistName = async (id: number, oldName: string) => {
    const newName = prompt("수정할 폴더 이름을 입력하세요:", oldName);
    if (!newName || newName === oldName) return;
    const { error } = await supabase.from('playlists').update({ name: newName }).eq('id', id);
    if (!error) fetchPlaylists();
  };

  const handleDeletePlaylist = async (id: number) => {
    if (!confirm("폴더를 삭제하시겠습니까?")) return;
    const { error } = await supabase.from('playlists').delete().eq('id', id);
    if (!error) {
      setSelectedPlaylist(null);
      fetchPlaylists();
    }
  };

  const postRefs = useRef<{ [key: number]: HTMLElement | null }>({});
  const moods = ['🌐 전체', '✨ 신나는', '🌙 새벽감성', '☁️ 잔잔한', '🔥 파워풀', '🎸 락킹한', '🎷 재즈틱', '🎹 클래식', '🌊 트렌디', '🎧 힙합/랩', '🌈 몽환적인'];
  const genres = ['🌐 전체', '🎤 발라드', '💃 댄스', '🎧 힙합', '🎵 R&B', '🌍 POP', '🇯🇵 J-POP', '🎸 인디', '🤘 락', '🎻 락발라드', '🎭 뮤지컬', '🎤 가요', '🎻 클래식'];
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadMood, setUploadMood] = useState('✨ 신나는');
  const [uploadGenre, setUploadGenre] = useState('🎤 발라드');

  useEffect(() => {
    fetchPosts();
    const saved = localStorage.getItem('recently_viewed');
    if (saved) setRecentlyViewed(JSON.parse(saved));
  }, []);

  // URL에서 postId를 감지하여 해당 곡으로 자동 이동 및 재생
  useEffect(() => {
    if (posts.length > 0 && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const postIdParam = params.get('postId');
      if (postIdParam) {
        const targetPost = posts.find(p => p.id === Number(postIdParam));
        if (targetPost) {
          // 약간의 지연을 주어 DOM 렌더링 후 스크롤이 확실히 작동하게 함
          setTimeout(() => {
            handlePlayAndScroll(targetPost);
          }, 500);
        }
      }
    }
  }, [posts]);

  const fetchPosts = async () => {
    // Always fetch all posts to keep the playback "Shield" intact
    const { data, error } = await supabase
      .from('music_posts')
      .select('id, title, artist, description, youtube_id, views, mood, genre, created_at')
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch user's liked posts if logged in
      let userLikedPostIds: number[] = [];
      if (user) {
        const { data: likedData } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id);
        userLikedPostIds = likedData?.map(l => l.post_id) || [];
      }

      // Get actual like counts from post_likes table
      const postsWithCounts = await Promise.all(
        data.map(async (p) => {
          const { count } = await supabase
            .from('post_likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', p.id);

          return {
            ...p,
            likes: count || 0,
            isLiked: userLikedPostIds.includes(p.id)
          };
        })
      );

      setPosts(postsWithCounts);
    }
  };

  const handlePlayAndScroll = async (post: Post) => {
    setCurrentPlayingId(post.id);
    setIsPaused(false);
    if (!activeYoutube.includes(post.id)) setActiveYoutube([post.id]);
    const targetElement = postRefs.current[post.id];
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setRecentlyViewed((prev) => {
      const filtered = prev.filter(p => p.id !== post.id);
      const updated = [post, ...filtered].slice(0, 8);
      localStorage.setItem('recently_viewed', JSON.stringify(updated));
      return updated;
    });
    await handleView(post.id);
  };

  const removeRecent = (id: number) => {
    const updated = recentlyViewed.filter(p => p.id !== id);
    setRecentlyViewed(updated);
    localStorage.setItem('recently_viewed', JSON.stringify(updated));
  };

  const handleTogglePause = () => {
    const iframes = document.querySelectorAll('iframe[src*="youtube"]');
    iframes.forEach((iframe: any) => {
      if (iframe.contentWindow) {
        const command = isPaused ? 'playVideo' : 'pauseVideo';
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
      }
    });
    setIsPaused(!isPaused);
  };

  const handleSkipNext = () => {
    const currentIndex = posts.findIndex(p => p.id === currentPlayingId);
    if (currentIndex !== -1 && currentIndex < posts.length - 1) {
      handlePlayAndScroll(posts[currentIndex + 1]);
    }
  };

  const handleSkipBack = () => {
    const currentIndex = posts.findIndex(p => p.id === currentPlayingId);
    if (currentIndex > 0) {
      handlePlayAndScroll(posts[currentIndex - 1]);
    }
  };

  const clearAllRecents = () => {
    if (confirm('전체 삭제하시겠습니까?')) {
      setRecentlyViewed([]);
      localStorage.removeItem('recently_viewed');
    }
  };

  const handleLike = async (postId: number, currentScore: number) => {
    // 1. 현재 로그인한 유저 정보 가져오기
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('로그인이 필요한 기능입니다.');
      return;
    }

    try {
      // 2. 중복 체크 강제: 이미 좋아요가 있는지 먼저 확인
      const { data: alreadyLiked, error: checkError } = await supabase
        .from('post_likes')
        .select('*')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (checkError) {
        console.error('좋아요 확인 오류:', checkError);
        return;
      }

      if (alreadyLiked) {
        // 이미 좋아요를 눌렀다면 삭제 (토글)
        const { error: deleteError } = await supabase
          .from('post_likes')
          .delete()
          .eq('id', alreadyLiked.id);

        if (deleteError) {
          console.error('좋아요 삭제 오류:', deleteError);
          return;
        }

        // DB 작업 성공 시에만 UI 갱신 - 전체 리스트 다시 가져오기
        fetchPosts();
      } else {
        // 좋아요가 없다면 추가
        const { error: insertError } = await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });

        if (insertError) {
          console.error('좋아요 추가 오류:', insertError);
          // 중복 키 에러일 가능성이 높으므로 함수 종료
          return;
        }

        // DB 작업 성공 시에만 UI 갱신 - 전체 리스트 다시 가져오기
        fetchPosts();
      }
    } catch (error) {
      console.error('예상치 못한 오류:', error);
    }
  };

  const handleView = async (postId: number) => {
    const { error } = await supabase.rpc('increment_views', { row_id: postId });
    if (!error) {
      setPosts(prev => prev.map(post =>
        post.id === postId ? { ...post, views: (post.views || 0) + 1 } : post
      ));
    }
  };

  const handleAddToPlaylist = (postId: number) => {
    if (!user) return alert("로그인이 필요합니다!");
    if (playlistFolders.length === 0) return alert("먼저 폴더를 생성해주세요!");
    setTargetPostId(postId);
    setIsSelectModalOpen(true);
  };

  const saveToPlaylist = async (folderId: number) => {
    if (!user || !targetPostId) return;
    const { error } = await supabase
      .from('user_playlists')
      .insert([{
        user_id: user.id,
        post_id: targetPostId,
        folder_id: folderId
      }]);
    if (error) {
      alert("이미 담긴 노래거나 오류가 발생했습니다.");
    } else {
      alert("플레이리스트에 추가되었습니다! ✅");
      setIsSelectModalOpen(false);
      fetchMyPlaylist();
    }
  };

  const addToPlaylist = async (postId: number, folderId: number) => {
    const { error } = await supabase
      .from('user_playlists')
      .insert([{
        user_id: user!.id,
        post_id: postId,
        folder_id: folderId
      }]);

    if (!error) {
      fetchMyPlaylist();
    }
  };

  const handleRemoveFromFolder = async (folderId: number, postId: number) => {
    if (!confirm('이 폴더에서 곡을 삭제하시겠습니까?')) return;
    const { error } = await supabase
      .from('user_playlists')
      .delete()
      .eq('folder_id', folderId)
      .eq('post_id', postId);
    if (!error) {
      fetchMyPlaylist();
    }
  };

  const fetchMyPlaylist = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_playlists')
      .select(`id, folder_id, post_id, music_posts (id, title, artist)`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setMyPlaylist(data as unknown as UserPlaylistItem[]);
    }
  };

  const handleRemoveFromPlaylist = async (postId: number) => {
    if (!selectedPlaylist) return;
    const { error } = await supabase
      .from('playlist_items')
      .delete()
      .eq('playlist_id', selectedPlaylist)
      .eq('post_id', postId);
    if (!error) fetchPosts();
  };

  const handleDeletePost = async (id: number) => {
    // 1차 확인 (유저님 스타일 유지)
    if (!window.confirm('게시물을 삭제하시겠습니까?')) return;

    // 2차 확인 (이 줄이 빠졌거나 순서가 꼬였을 확률이 높아요!)
    if (!window.confirm('삭제된 게시물은 복구할 수 없습니다. 정말로 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('music_posts')
        .delete()
        .eq('id', id); // String(id) 안 해도 됩니다!

      if (error) {
        alert(`삭제 중 오류가 발생했습니다: ${error.message}`);
      } else {
        alert('게시물이 성공적으로 삭제되었습니다.');
        fetchPosts();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    }
  };
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setPlaylists([]);
    setSelectedPlaylist(null);
  };

  const handleUpdateDesc = async (id: number, content: string) => {
    const { error } = await supabase
      .from('music_posts')
      .update({ description: content })
      .eq('id', id);
    if (!error) {
      setEditingId(null);
      setEditDesc('');
      fetchPosts();
    } else {
      alert('작업 중 오류가 발생했습니다.');
    }
  };
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = youtubeUrl.match(regExp);
    const youtubeId = (match && match[2].length === 11) ? match[2] : null;
    await supabase.from('music_posts').insert([{
      title, artist, description, youtube_id: youtubeId,
      mood: uploadMood, genre: uploadGenre, likes: 0, views: 0
    }]);
    setTitle(''); setArtist(''); setDescription(''); setYoutubeUrl('');
    fetchPosts();
  };

  const handleGenreSelect = (genre: string) => {
    setSelectedGenre(genre.trim());
  };

  const filteredPosts = posts.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.artist.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMood = selectedMood === '전체' || selectedMood.includes('전체') || p.mood === selectedMood;
    const matchesGenre = selectedGenre.includes('전체') || p.genre === selectedGenre;

    // Folder and Playlist filtering now happens client-side to protect the player
    let matchesFolder = true;
    if (selectedFolderId) {
      matchesFolder = myPlaylist.some(item => item.folder_id === selectedFolderId && item.post_id === p.id);
    }

    let matchesPlaylist = true;
    // Playlists seem to be a separate thing in the current DB schema? 
    // The previous fetchPosts handled it, adding client-side check if needed or just folder for now.
    // Given the prompt, "Folder" is the main concern.

    return matchesSearch && matchesMood && matchesGenre && matchesFolder && matchesPlaylist;
  });

  const topPosts = [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 3);

  // --- 서브 컴포넌트: 레이아웃 조각 ---
  const MainHeader = () => (
    <header className="flex items-center justify-between mb-12">
      <div onClick={() => window.location.href = '/'} className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
        <div className="bg-gradient-to-tr from-purple-600 to-blue-500 p-2 rounded-xl shadow-lg shadow-purple-500/20"><Music className="text-white" size={28} /></div>
        <h1 className="text-3xl font-black italic tracking-tighter bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">MICHIDA</h1>
      </div>
      {user ? (
        <div className="flex items-center gap-4">
          <Link href={`/profile/${user.id}`} className="flex items-center gap-3 cursor-pointer group transition-all hover:opacity-80">
            <img src={user.user_metadata.avatar_url || user.user_metadata.picture} className="w-8 h-8 rounded-full border border-purple-500 group-hover:border-purple-400 transition-colors shadow-lg shadow-purple-500/20" />
            <span className="text-white text-xs font-bold group-hover:text-purple-400 transition-colors cursor-pointer">{user.user_metadata.full_name || user.user_metadata.name}님</span>
          </Link>
          <div className="w-px h-3 bg-slate-800" />
          <button onClick={handleLogout} className="text-[10px] text-slate-500 hover:text-red-400 font-bold transition-colors uppercase tracking-widest">LOGOUT</button>
        </div>
      ) : (
        <button onClick={handleLogin} className="px-4 py-1.5 rounded-lg bg-white text-black text-xs font-black hover:bg-purple-500 hover:text-white transition-all">GOOGLE LOGIN</button>
      )}
    </header>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        <MainHeader />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 왼쪽 사이드바: 공유 및 최근 재생 */}
          <aside className="lg:col-span-3 space-y-6 lg:sticky lg:top-8 h-fit">
            <div className="bg-[#141418] p-6 rounded-[2rem] border border-purple-500/10">
              <h2 className="text-sm font-black mb-6 text-purple-400 flex items-center gap-2 uppercase tracking-tighter"><Upload size={18} /> 곡 공유하기</h2>
              {user ? (
                <form onSubmit={handleUpload} className="space-y-3">
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목" className="w-full bg-[#0a0a0c] rounded-xl p-3 text-xs border border-slate-800 outline-none focus:border-purple-500/50" required />
                  <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="가수" className="w-full bg-[#0a0a0c] rounded-xl p-3 text-xs border border-slate-800 outline-none focus:border-purple-500/50" required />
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="곡에 대한 짤막한 소개를 남겨주세요" className="w-full bg-[#0a0a0c] rounded-xl p-3 text-xs border border-slate-800 outline-none focus:border-purple-500/50 min-h-[80px] resize-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={uploadMood} onChange={e => setUploadMood(e.target.value)} className="bg-[#0a0a0c] rounded-xl p-3 text-[10px] border border-slate-800 text-slate-400 outline-none">
                      {moods.filter(m => m !== '전체').map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select value={uploadGenre} onChange={e => setUploadGenre(e.target.value)} className="bg-[#0a0a0c] rounded-xl p-3 text-[10px] border border-slate-800 text-slate-400 outline-none">
                      {genres.filter(g => g !== '전체').map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="유튜브 URL" className="w-full bg-[#0a0a0c] rounded-xl p-3 text-xs border border-slate-800 outline-none focus:border-purple-500/50" required />
                  <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-blue-600 py-3 rounded-xl font-black text-xs hover:opacity-90 transition-opacity">공유하기</button>
                </form>
              ) : (
                <div className="bg-[#16161a] p-10 rounded-3xl border border-dashed border-white/10 text-center">
                  <Lock className="mx-auto mb-4 text-slate-600" size={40} />
                  <p className="text-slate-400 mb-6">로그인한 멤버만 곡을 공유할 수 있습니다.</p>
                  <button onClick={handleLogin} className="w-full h-12 flex items-center justify-center bg-purple-600 rounded-full text-white font-bold transition-transform hover:scale-105 hover:bg-purple-700">1초만에 로그인하기</button>
                </div>
              )}
            </div>

            <div className="bg-[#141418] p-6 rounded-[2rem] border border-blue-500/10 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-[11px] font-black text-blue-400 flex items-center gap-2 uppercase tracking-[0.2em]"><HeadphoneOff size={14} /> 최근 재생한 노래</h2>
                <button onClick={clearAllRecents} className="text-[9px] text-slate-600 hover:text-red-400 font-bold underline">전체 삭제</button>
              </div>
              <div className="space-y-2">
                {recentlyViewed.map(post => (
                  <div key={post.id} className="flex items-center group gap-2 min-w-0">
                    <div onClick={() => handlePlayAndScroll(post)} className={`flex-1 min-w-0 flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${currentPlayingId === post.id ? "bg-purple-600/20 border border-purple-500/30" : "bg-[#0a0a0c] border border-transparent hover:border-slate-800"}`}>
                      <div className={`w-1 h-3 flex-shrink-0 ${currentPlayingId === post.id ? "bg-purple-500 animate-bounce" : "bg-slate-800"}`} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className={`text-sm font-bold truncate block ${currentPlayingId === post.id ? "text-purple-400" : "text-white"}`}>{post.title}</span>
                        <span className="text-[11px] text-slate-500 truncate block mt-0.5">{post.artist}</span>
                      </div>
                    </div>
                    <button onClick={() => removeRecent(post.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* 중앙: 메인 피드 */}
          <main className="lg:col-span-6 space-y-8">
            <div className={`sticky top-0 z-40 py-4 bg-[#0a0a0c]/80 backdrop-blur-md transition-all ${showTopButton ? "border-b border-white/10 shadow-2xl" : ""}`}>
              {/* --- 상단 고정 미니 재생바 (Mini Player Bar) --- */}
              {currentPlayingId && (searchTerm || filteredPosts.length === 0) && (
                <div className="mb-4 px-4 py-2 bg-gradient-to-r from-purple-900/40 to-black/40 border border-purple-500/20 rounded-2xl backdrop-blur-xl flex items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 shadow-[0_0_20px_rgba(139,61,255,0.15)] h-12">
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={handleSkipBack} className="p-1.5 text-slate-400 hover:text-white transition-colors"><Minus size={14} /></button>
                      <button onClick={handleTogglePause} className="w-8 h-8 flex items-center justify-center bg-purple-600 rounded-full text-white hover:scale-105 transition-transform shadow-lg shadow-purple-500/20">
                        {isPaused ? <Play size={14} className="fill-current translate-x-[1px]" /> : <div className="flex gap-[2px] items-center"><div className="w-[3px] h-3 bg-white" /><div className="w-[3px] h-3 bg-white" /></div>}
                      </button>
                      <button onClick={handleSkipNext} className="p-1.5 text-slate-400 hover:text-white transition-colors"><Plus size={14} /></button>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-black text-white truncate tracking-tight">{posts.find(p => p.id === currentPlayingId)?.title}</span>
                      <span className="text-[8px] text-purple-400 font-bold uppercase tracking-wider">{posts.find(p => p.id === currentPlayingId)?.artist}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1 h-3 bg-purple-500 animate-pulse" />
                      <div className="w-1 h-3 bg-purple-400 animate-pulse delay-75" />
                      <div className="w-1 h-3 bg-purple-300 animate-pulse delay-150" />
                    </div>
                  </div>
                </div>
              )}

              {selectedFolderId && (
                <div className="mb-3 p-3 bg-purple-600/10 border border-purple-500/20 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2">
                    <Folder size={16} className="text-purple-400" />
                    <span className="text-sm text-purple-300 font-medium">{playlistFolders.find(f => f.id === selectedFolderId)?.name} 폴더 필터링 중</span>
                  </div>
                  <button onClick={handleClearFolderFilter} className="text-xs text-purple-400 hover:text-purple-300 font-black underline">필터 해제</button>
                </div>
              )}
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-purple-500" size={20} />
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-[#16161a] p-4 pl-12 rounded-2xl border border-white/5 focus:ring-2 focus:ring-purple-500 outline-none shadow-xl" placeholder="당신의 감성을 검색하세요" />
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {moods.map(m => <button key={m} onClick={() => setSelectedMood(m)} className={`px-4 py-2 rounded-full text-[10px] font-black whitespace-nowrap transition-all ${selectedMood === m ? "bg-purple-600 text-white" : "bg-[#141418] text-slate-500 border border-slate-800"}`}>{m}</button>)}
            </div>

            <div className="grid gap-12">
              {/* --- 1. 재생 보호막 (Shield Area): 필터링과 무관하게 재생 중인 곡은 DOM 유지 --- */}
              <div className="hidden-player-shield">
                {posts.map(post => {
                  const isFiltered = filteredPosts.some(p => p.id === post.id);
                  const isPlaying = activeYoutube.includes(post.id);

                  // 재생 중인데 필터링에 걸려있지 않은 경우에만 'hidden'으로 유지
                  if (!isFiltered && isPlaying) {
                    return (
                      <div key={`shield-${post.id}`} className="hidden">
                        <PostCard
                          post={post} user={user} currentPlayingId={currentPlayingId} activeYoutube={activeYoutube}
                          editingId={editingId} editDesc={editDesc} handlePlayAndScroll={handlePlayAndScroll}
                          handleAddToPlaylist={handleAddToPlaylist} handleRemoveFromPlaylist={handleRemoveFromPlaylist}
                          handleDeletePost={handleDeletePost} handleUpdateDesc={handleUpdateDesc}
                          setEditingId={setEditingId} setEditDesc={setEditDesc} handleLike={handleLike}
                          searchTerm={searchTerm} selectedPlaylist={selectedPlaylist} postRefs={postRefs}
                        />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              {/* --- 2. 목록 영역 (List Area): 실제 사용자에게 보이는 결과 --- */}
              {filteredPosts.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-32 text-center">
                  {selectedFolderId ? (
                    <>
                      <Music2 size={64} className="mb-6 text-slate-400 opacity-50" />
                      <h3 className="text-2xl font-light text-slate-300 mb-3">폴더가 비어있습니다. 🎵</h3>
                      <button onClick={handleClearFolderFilter} className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl text-sm font-black transform hover:scale-105 transition-all">전체 곡 보러가기</button>
                    </>
                  ) : (
                    <><SearchX size={48} className="mb-4 text-slate-600 opacity-50" /><p className="text-lg text-slate-400">찾는 곡이 없습니다.</p></>
                  )}
                </div>
              ) : (
                filteredPosts.map(post => (
                  <div key={post.id} className="block">
                    <PostCard
                      post={post} user={user} currentPlayingId={currentPlayingId} activeYoutube={activeYoutube}
                      editingId={editingId} editDesc={editDesc} handlePlayAndScroll={handlePlayAndScroll}
                      handleAddToPlaylist={handleAddToPlaylist} handleRemoveFromPlaylist={handleRemoveFromPlaylist}
                      handleDeletePost={handleDeletePost} handleUpdateDesc={handleUpdateDesc}
                      setEditingId={setEditingId} setEditDesc={setEditDesc} handleLike={handleLike}
                      searchTerm={searchTerm} selectedPlaylist={selectedPlaylist} postRefs={postRefs}
                    />
                  </div>
                ))
              )}
            </div>
          </main>

          {/* 오른쪽 사이드바: 랭킹 및 내 리스트 */}
          <aside className="lg:col-span-3 lg:sticky lg:top-8 h-fit space-y-8">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] px-4">Genre Filter</h3>
              <div className="bg-[#141418]/50 p-4 rounded-[2.5rem] border border-slate-800/50 flex flex-col gap-1 backdrop-blur-sm">
                {genres.map(g => (
                  <button key={g} onClick={() => handleGenreSelect(g)} className={`flex items-center justify-between p-3 rounded-xl text-[11px] font-bold transition-all ${selectedGenre === g ? "bg-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-800/50"}`}>
                    {g} {selectedGenre === g && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#16161a] p-6 rounded-3xl border border-white/5 shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Flame className="text-orange-500" size={24} /> TODAY'S HOT</h2>
              <div className="space-y-4">
                {topPosts.map((post, idx) => (
                  <div key={post.id} onClick={() => handlePlayAndScroll(post)} className="flex items-center gap-4 group cursor-pointer hover:translate-x-1 transition-transform">
                    <span className="text-2xl font-black italic text-slate-800 group-hover:text-purple-600 transition-colors">0{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-slate-200 truncate group-hover:text-purple-400">{post.title}</p>
                      <p className="text-[9px] text-slate-600 font-bold">{post.artist}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#16161a] p-6 rounded-3xl border border-white/5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Music2 className="text-purple-500" size={24} /> PLAYLIST</h2>
                <button onClick={handleCreateFolder} className="p-1 hover:bg-white/10 rounded-full transition-colors"><Plus size={20} className="text-slate-400" /></button>
              </div>
              <div className="space-y-4">
                {playlistFolders.length === 0 ? <p className="text-sm text-slate-500 text-center">폴더가 없습니다.</p> : playlistFolders.map(folder => (
                  <div key={folder.id} className="space-y-2">
                    <div className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${selectedFolderId === folder.id ? "bg-purple-600/20 border border-purple-500/40" : "bg-purple-900/10 hover:bg-purple-800/20"}`}>
                      <div className="flex items-center gap-2 flex-1" onClick={() => handleFolderClick(folder.id)}>
                        <Folder size={16} className={selectedFolderId === folder.id ? "text-purple-300" : "text-purple-400"} />
                        <span className={`text-sm font-medium ${selectedFolderId === folder.id ? "text-purple-200" : "text-purple-300"}`}>{folder.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={e => { e.stopPropagation(); handleUpdateFolderName(folder.id, folder.name); }} className="p-1 text-slate-500 hover:text-purple-400"><Edit2 size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id); }} className="p-1 text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="ml-4 space-y-1">
                      {myPlaylist.filter(item => item.folder_id === folder.id && item.music_posts).map(item => (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer group">
                          <div onClick={() => handlePlayAndScroll({
                            id: item.music_posts!.id,
                            title: item.music_posts!.title,
                            artist: item.music_posts!.artist,
                            description: '',
                            likes: 0,
                            mood: '',
                            genre: '',
                            youtube_id: (posts.find(p => p.id === item.music_posts!.id)?.youtube_id)
                          } as any)} className="flex items-center gap-2 flex-1 min-w-0">
                            <Play size={10} className={`text-purple-500 ${currentPlayingId === item.music_posts!.id ? 'opacity-100' : 'opacity-0 stroke-[3]'} group-hover:opacity-100`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium truncate ${currentPlayingId === item.music_posts!.id ? 'text-purple-400' : 'text-slate-300'}`}>{item.music_posts?.title}</p>
                              <p className="text-[9px] text-slate-500">{item.music_posts?.artist}</p>
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveFromFolder(folder.id, item.post_id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-500 transition-all">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {isSelectModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#141418] border border-white/10 w-full max-w-xs rounded-[2rem] p-6">
            <h3 className="text-white font-black mb-4 flex items-center justify-between">폴더 선택 <button onClick={() => setIsSelectModalOpen(false)}><X size={20} /></button></h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {playlistFolders.map(folder => <button key={folder.id} onClick={() => saveToPlaylist(folder.id)} className="w-full p-4 bg-white/5 hover:bg-purple-600 rounded-xl text-left text-xs font-bold transition-all text-white flex items-center gap-2"><Folder size={14} />{folder.name}</button>)}
            </div>
          </div>
        </div>
      )}

      {showTopButton && <button onClick={scrollToTop} className="fixed bottom-10 right-10 p-4 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg z-50 animate-bounce-subtle shadow-purple-500/50"><ArrowUp size={24} /></button>}
    </div>
  );
}
