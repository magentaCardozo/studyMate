-- Révisions : un QCM « Questions ratées » copie les questions à retravailler en gardant
-- le lien vers la question d'origine (une bonne réponse la retire de la liste).
ALTER TABLE "QuizQuestion" ADD COLUMN "originQuestionId" UUID;
CREATE INDEX "QuizQuestion_originQuestionId_idx" ON "QuizQuestion"("originQuestionId");
