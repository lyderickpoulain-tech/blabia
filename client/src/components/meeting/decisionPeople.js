import { createContext, useContext } from 'react';

// Questions des agents confiées à un autre humain (v5.1) : participants de la réunion et
// actions, fournis par la salle de réunion à toutes les cartes de question (fil, panneau)
// { others: [{ userId, name }], currentUserId, onAssign(messageId, userId|null), onReclaim(messageId) }
export const DecisionPeopleContext = createContext(null);
export const useDecisionPeople = () => useContext(DecisionPeopleContext);
