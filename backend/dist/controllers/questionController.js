"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearQuestions = exports.replaceQuestions = exports.addQuestions = void 0;
const db_1 = require("../config/db");
// POST /quiz/:id/questions — bulk insert questions
const addQuestions = async (req, res) => {
    const quizId = parseInt(req.params.id);
    // verify ownership
    const quiz = await db_1.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz)
        return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.creatorId !== req.user.userId)
        return res.status(403).json({ error: 'Not your quiz' });
    if (quiz.status === 'active' || quiz.status === 'ended')
        return res.status(400).json({ error: 'Cannot edit an active or ended quiz' });
    const { questions } = req.body;
    // questions = [{ text, options: ["A","B","C","D"], answer: "A", position: 1 }]
    if (!Array.isArray(questions) || questions.length === 0)
        return res.status(400).json({ error: 'Provide at least one question' });
    // validate each question has required fields
    for (const q of questions) {
        if (!q.text || !q.options || !q.answer || q.position === undefined)
            return res.status(400).json({ error: 'Each question needs text, options, answer, position' });
        if (!Array.isArray(q.options) || q.options.length < 2)
            return res.status(400).json({ error: 'Each question needs at least 2 options' });
        if (!q.options.includes(q.answer))
            return res.status(400).json({ error: `Answer "${q.answer}" must be one of the options` });
    }
    // bulk insert using createMany
    await db_1.prisma.question.createMany({
        data: questions.map((q) => ({
            quizId,
            text: q.text,
            options: q.options,
            answer: q.answer,
            position: q.position
        }))
    });
    const saved = await db_1.prisma.question.findMany({
        where: { quizId },
        orderBy: { position: 'asc' }
    });
    res.status(201).json({ message: `${saved.length} questions saved`, questions: saved });
};
exports.addQuestions = addQuestions;
// PUT /quiz/:id/questions — replace the complete draft question set without duplicates.
const replaceQuestions = async (req, res) => {
    const quizId = parseInt(req.params.id);
    const quiz = await db_1.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz)
        return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.creatorId !== req.user.userId)
        return res.status(403).json({ error: 'Not your quiz' });
    if (quiz.status === 'active' || quiz.status === 'ended')
        return res.status(400).json({ error: 'Cannot edit an active or ended quiz' });
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0)
        return res.status(400).json({ error: 'Provide at least one question' });
    for (const question of questions) {
        if (!question.text || !Array.isArray(question.options) || !question.answer || question.position === undefined)
            return res.status(400).json({ error: 'Each question needs text, options, answer, position' });
        if (question.options.length < 2 || !question.options.includes(question.answer))
            return res.status(400).json({ error: 'Each answer must be one of at least two options' });
    }
    await db_1.prisma.$transaction([
        db_1.prisma.question.deleteMany({ where: { quizId } }),
        db_1.prisma.question.createMany({ data: questions.map(question => ({ quizId, text: question.text, options: question.options, answer: question.answer, position: question.position })) })
    ]);
    const saved = await db_1.prisma.question.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
    res.json({ message: `${saved.length} questions saved`, questions: saved });
};
exports.replaceQuestions = replaceQuestions;
// DELETE /quiz/:id/questions — clear all questions (for rewrite)
const clearQuestions = async (req, res) => {
    const quizId = parseInt(req.params.id);
    const quiz = await db_1.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz)
        return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.creatorId !== req.user.userId)
        return res.status(403).json({ error: 'Not your quiz' });
    await db_1.prisma.question.deleteMany({ where: { quizId } });
    res.json({ message: 'All questions cleared' });
};
exports.clearQuestions = clearQuestions;
