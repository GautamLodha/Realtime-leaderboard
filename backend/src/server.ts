import {prisma} from './config/db'
import express from 'express'
import 'dotenv/config'
const app = express()

app.use(express.json())
async function main(){
    await prisma.user.create({
        data : {
            email : "",
            password : "",
            createdAt : new Date()
        }
    })
}
main()
app.listen(process.env.PORT || 5000)