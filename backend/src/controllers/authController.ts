import { Request,Response } from "express";
import { prisma } from "../config/db";
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
const JWT_SECRET = process.env.JWT_SECRET || 'secretKey';

export const register = async (req : Request,res : Response)=>{
  try {
    const {email,username,password} = req.body
    console.log("reachibg here");
    const existingMail = await prisma.user.findFirst({
      where : {email}
    })
    
    
    if(existingMail){
      res.status(400).json({error : "email already exists"})
    }
    const existingUserName = await prisma.user.findFirst({
      where : {username}
    })
    if(existingUserName){
      res.status(400).json({error : "username already exists"})
    }
    const hashedPassword = await bcrypt.hash(password,19);
    const user = await prisma.user.create({
      data : {username,email,password : hashedPassword}
    })
    return res.status(200).json({message : "user created succesfully",userId : user.id})

  } catch (error) {
    if(error instanceof Error){
      res.status(500).json({ error :  error.message });
    }else{
      res.status(500).json({error : "internal server errr"});
    }
    
  }
}
export const login = async (req : Request,res : Response)=>{
  try {
    const {email,username,password} = req.body
    const user = await prisma.user.findUnique({where :{email}});
    if (!user) {
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }
    const isMatch = await bcrypt.compare(password,user.password);
    if(!isMatch){
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }
    const token = jwt.sign({id : user.id,role : user.role},JWT_SECRET,{expiresIn : '1d' })
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    return;
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
  

}