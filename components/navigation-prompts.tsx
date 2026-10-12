'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {Button} from './ui/button';
import {answerDiscardPrompt,hasDiscardPrompt,subscribeDiscardPrompt} from '@/hooks/use-app-navigation';
export function NavigationPrompts(){const [open,setOpen]=useState(false);useEffect(()=>subscribeDiscardPrompt(()=>setOpen(hasDiscardPrompt())),[]);return <Dialog open={open} onOpenChange={next=>{if(!next)answerDiscardPrompt(false);}}><DialogContent className="discard-dialog"><DialogHeader><DialogTitle>Discard unsaved changes?</DialogTitle><DialogDescription>Your changes have not been saved.</DialogDescription></DialogHeader><div className="notification-actions"><Button variant="outline" onClick={()=>answerDiscardPrompt(false)}>Keep editing</Button><Button onClick={()=>answerDiscardPrompt(true)}>Discard changes</Button></div></DialogContent></Dialog>;}
