const db = require('quick.db')
const { Client, Util, MessageAttachment, DiscordAPIError, MessageEmbed } = require('discord.js')
const { startsWith } = require('ffmpeg-static')
const ytdl = require('ytdl-core')
const Youtube = require('simple-youtube-api')
const ms = require('ms')
const DBL = require("dblapi.js");
const TOKEN = 'NzY1MzMwMzUwMzgxMzM0NTg4.X4TPbg.5fKtBAb-sWMEZ9YAsLSIp6odhkk'
const YOUTUBE_API = 'AIzaSyCSXPwiEi82MQYP8i27AMzg-eWnP_9vL2Y'
const fetch = require('node-fetch')
const cheerio = require('cheerio')
const lyricsFinder = require("lyrics-finder");

const client = new Client({ disableEveryone: true })

// Optional events
const dbl = new DBL('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijc2NTMzMDM1MDM4MTMzNDU4OCIsImJvdCI6dHJ1ZSwiaWF0IjoxNjA2MjYxMDk4fQ.ogIUNQqRHk176YOGpAoMOLBsLrk_nqkmz4vHu4DFZS8', client);
dbl.on('posted', () => {
    console.log('Server count posted!');
})

dbl.on('error', e => {
    console.log(`Oops! ${e}`);
})

const youtube = new Youtube(YOUTUBE_API)

const queue = new Map()

client.on("voiceStateUpdate", (oldState, newState) => newState.member.id === client.user.id && oldState.deaf && !newState.deaf ? newState.member.voice.setDeaf(true) : null)

client.on('ready', () => {
    console.log('Active')

    setInterval(() => {
        const statuses = [
            `sm?help | sp0okymusic.xyz`
        ]

        const status = statuses[Math.floor(Math.random() * statuses.length)]
        client.user.setActivity(status, { type: "LISTENING" })
    }, 5000)
})

client.on('message', async message => {
    const PREFIX = db.get(`guild_${message.guild && message.guild.id}_prefix`) || "sm?"
    if (!message.content.startsWith(PREFIX)) return

    const args = message.content.substring(PREFIX.length).split(" ")
    const searchString = args.slice(1).join(' ')
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : ''
    const serverQueue = queue.get(message.guild.id)

    if (message.content.startsWith(`${PREFIX}prefix`)) {
        if (!message.member.hasPermission("MANAGE_GUILD")) return message.channel.send("You Have Insufficient Perms!!")
        if (!args[1]) return message.channel.send("Provide A Prefix Please")
        if (args[1] === db.get(`guild_${message.guild.id}_prefix`)) return message.channel.send('That Is Already Your Prefix')
        if (args[1] === '?') db.delete(`guild_${message.guild.id}_prefix`)
        db.set(`guild_${message.guild.id}_prefix`, args[1])
        return message.channel.send(`I Have Now Set Your Prefix To ${args[1]}`)
    }


    if (message.content.startsWith(`${PREFIX}play`)) {
        const voiceChannel = message.member.voice.channel
        if (!voiceChannel) return message.channel.send('You Need To Be In A Voice Channel')
        const permissions = voiceChannel.permissionsFor(message.client.user)
        if (!permissions.has('CONNECT')) return message.channel.send('I Dont\'t Have Permissions To Connect')
        if (!permissions.has('SPEAK')) return message.channel.send('I Don\'t Have Permisson To Speak')
        if (!args[1]) return message.channel.send('Please Put A Song Name')

        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
            const playlist = await youtube.getPlaylist(url).catch(erro => {
                return message.reply("A Playlist é privada ou não existe!")
            });
            const videos = await playlist.getVideos().catch(erro => {
                message.reply("Ocorreu um problema ao colocar um dos vídeos da playlist na fila!'")
            });
            for (const video of Object.values(videos)) {
                try {
                    const video2 = await youtube.getVideoByID(video.id)
                    await handleVideo(video2, message, voiceChannel, true)
                } catch {

                }
            }
            let embed = new MessageEmbed()
                .setColor(0x030303)
                .setAuthor('Playlist', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
                .setDescription(`[${playlist.title}](${playlist.url}) has been added to the queue`)
                .setFooter(`Requested By: ${message.author.username}`, message.author.displayAvatarURL())
            message.channel.send(embed)
            return undefined
        } else {

            try {
                var video = await youtube.getVideoByID(url)
            } catch {
                try {
                    var videos = await youtube.searchVideos(searchString, 1)
                    var video = await youtube.getVideoByID(videos[0].id)
                } catch (e) {
                    console.log(e)
                    return message.channel.send('I Couldn\'t Find Any Results Please Try Again...')



                }
            }
            return handleVideo(video, message, voiceChannel)
        }
    } else if (message.content.startsWith(`${PREFIX}stop`)) {
        if (!message.member.voice.channel) return message.channel.send('You Need To Be In A Voice Channel To Stop The Music')
        if (!serverQueue) return message.channel.send('There Is Nothing Playing')
        serverQueue.songs = []
        serverQueue.connection.dispatcher.end()
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Stopped', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription(`I Have Stopped The Music`)
        message.channel.send(embed)
        return undefined

    } else if (message.content.startsWith(`${PREFIX}skip`)) {
        if (!message.member.voice.channel) return message.channel.send('You Need To Be In A Voice Channel To Skip')
        if (!serverQueue) return message.channel.send('There Is Nothing Playing')
        serverQueue.connection.dispatcher.end()
        message.channel.send('Skipped!')
        return undefined
    } else if (message.content.startsWith(`${PREFIX}volume`)) {
        if (!message.member.voice.channel) return message.channel.send('You Need To Be In A Voice Channel To Change Volume')
        if (!serverQueue) return message.channel.send('There Is Nothing Playing')
        if (!args[1]) return message.channel.send(`That volume is **${serverQueue.volume}**`)
        if (isNaN(args[1])) return message.channel.send('That Is Not A Value Amount To Change The Volume To')
        serverQueue.volume = args[1]
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5)
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Volume', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription(`I Have Changed The Volume To: **${args[1]}**`)
        message.channel.send(embed)
        return undefined
    } else if (message.content.startsWith(`${PREFIX}np`)) {
        if (!serverQueue) return message.channel.send('There Is Nothing Playing')
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Playing', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription(`Currently Playing [${serverQueue.songs[0].title}]( ${serverQueue.songs[0].url})`)
        message.channel.send(embed)
        return undefined
    } else if (message.content.startsWith(`${PREFIX}pause`)) {
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Pause', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription(`This Command Is Being Fixed`)
        message.channel.send(embed)
        return undefined
    } else if (message.content.startsWith(`${PREFIX}resume`)) {
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Resume', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription(`This Command Is Being Fixed`)
        message.channel.send(embed)
        return undefined
    } else if (message.content.startsWith(`${PREFIX}loop`)) {
        if (!message.member.voice.channel) return message.channel.send('You Need To Be In A Voice Channel To Use The Loop Command')
        if (!serverQueue) return message.channel.send('There Is Nothing Playing')
        serverQueue.loop = !serverQueue.loop
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Loop', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription(`I Have Now ${serverQueue.loop ? `**Enabled**` : `**Disabled**`} loop.`)
        message.channel.send(embed)


    } else if (message.content.startsWith(`${PREFIX}help`)) {
const PREFIX = db.get(`guild_${message.guild.id}_prefix`)
        let embed2 = new MessageEmbed()
            .setColor('BLACK')
            .setAuthor('Commands', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription(`**Music Commands**\n${PREFIX}play\n${PREFIX}stop\n${PREFIX}skip\n${PREFIX}loop\n${PREFIX}queue\n${PREFIX}np\n${PREFIX}volume\n${PREFIX}lyrics\n${PREFIX}search <song>\n**General Commands**\n${PREFIX}prefix\n${PREFIX}latency\n${PREFIX}vote\n\n**Spooky Music Now Has The Playlist Feature!!**`)
            .setFooter('Version 1.2')
        let embed = new MessageEmbed()
            .setColor('BLACK')
            .setAuthor('Help', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription(`If you want to use Spooky Music just use ${PREFIX}play **<song>**. Use Youtube links or any song name.`)
            .addField('Commands', 'You can find the commands [here](https://sp0okymusic.weebly.com/commands.html)')
            .addField('Invite My Bot', 'To invite/visit my bot use these links [spookymusic](https://sp0okymusic.weebly.com) and [top.gg](https://top.gg/bot/765330350381334588)')
            .addField('Help/Support', `If you need any help using the bot or if there is something wrong visit our [Support](https://tawk.to/9b07eec92e52e0c286fca2cfb618c9e3d9a4e4b4) page\n\n **Check your dm\'s <@${message.author.id}> for a list of commands**`)
            .setFooter('Version 1.2')
        message.channel.send(embed)
        client.users.cache.get(message.author.id).send(embed2)


    } else if (message.content.startsWith(`${PREFIX}premium`)) {
        let embed = new MessageEmbed()
            .setAuthor('Premium', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setDescription('[__Click here__](https://sp0okymusic.weebly.com/premium.html)')
        message.channel.send(embed)
    } else if (message.content.startsWith(`${PREFIX}latency`)) {
        let botMsg = await message.channel.send('Pinging!!....')

        let embed = new MessageEmbed()
            .setAuthor('Pong!', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
            .setThumbnail(client.user.avatarURL)

            .setTimestamp()
            .addField('Bots Ping', `${Math.round(botMsg.createdAt - message.createdAt)}ms!`)
            .addField('API Ping', `${Math.round(client.ws.ping)}ms!`)
            .setFooter(`Requested by: ${message.author.tag}`, message.author.avatarURL)
            .setColor(0x030303)

        botMsg.edit(embed)
    } else if (message.content.startsWith(`${PREFIX}vote`)) {
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Vote Us', 'https://cdn.discordapp.com/avatars/765330350381334588/d6e8cf2faec57d588bd10fe0ff3b7a0f.webp?size=128')
            .setDescription('[Click here](https://top.gg/bot/765330350381334588)')

        message.channel.send(embed)

    } else if (message.content.startsWith(`${PREFIX}servers`)) {
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Servers', 'https://cdn.discordapp.com/avatars/765330350381334588/d6e8cf2faec57d588bd10fe0ff3b7a0f.webp?size=128')
            .setDescription(`Watching ${client.guilds.cache.size} Servers`)
        message.channel.send(embed)
    } else if (message.content.startsWith(`${PREFIX}uptime`)) {
        let days = 0
        let week = 0
        let uptime = ``;
        let totalseconds = (client.uptime / 1000)
        let hours = Math.floor(totalseconds / 3600)
        totalseconds %= 3600
        let minutes = Math.floor(totalseconds / 60)
        let seconds = Math.floor(totalseconds % 60)

        if (hours > 23) {
            days = days + 1
            hours = 0
        }

        if (week) {
            uptime += `${week} week, `
        }

        if (minutes > 60) {
            minutes = 0
        }

        uptime += `${days} days, ${hours} hours, ${minutes} minutes and ${seconds} seconds`

        let uptimeEmbed = new MessageEmbed()
            .setColor(0x030303)
            .addField(`Uptime`, uptime)

        message.channel.send(uptimeEmbed)
    } else if (message.content.startsWith(`${PREFIX}vc`)) {
        let embed = new MessageEmbed()
            .setColor(0x030303)
            .setAuthor('Voice Channels', 'https://cdn.discordapp.com/avatars/765330350381334588/d6e8cf2faec57d588bd10fe0ff3b7a0f.webp?size=128')
            .setDescription(`${client.voice.connections.size} voice channels!`)
        message.channel.send(embed)
    } else if (message.content.startsWith(`${PREFIX}search`)) {
        if (!args[0]) return message.channel.send("**Please Enter A Song Name!**")
        const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
        const searchString = args.slice(1).join(' ');

        const { channel } = message.member.voice;
        if (!channel) return message.channel.send("**You Are Not In A Voice Channel!**");


        const permissions = channel.permissionsFor(message.client.user);
        if (!permissions.has('CONNECT')) {
            return message.channel.send('I cannot connect to your voice channel, make sure I have the proper permissions!');
        }
        if (!permissions.has('SPEAK')) {
            return message.channel.send('I cannot speak in this voice channel, make sure I have the proper permissions!');
        }

        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
            const playlist = await youtube.getPlaylist(url);
            const videos = await playlist.getVideos();

            for (const video of Object.values(videos)) {
                const video2 = await youtube.getVideoByID(video.id);
                await handleVideo(video2, message, channel, true);
            }
        }
        else {
            try {
                var video = await youtube.getVideo(url);
                console.log(video)
            } catch (error) {
                try {
                    var videos = await youtube.searchVideos(searchString, 10);
                    let index = 0;
                    const sembed = new MessageEmbed()
                        .setColor("BLACK")
                        .setFooter(message.member.displayName, message.author.avatarURL())
                        .setDescription(`
                            __**Song selection:**__\n
                            ${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')} 
                            \n**Pick a song between 1-10**
                            
                                         `)
                        .setTimestamp();
                    message.channel.send(sembed).then(message2 => message2.delete({ timeout: 20000 }))
                    try {
                        var response = await message.channel.awaitMessages(message2 => message2.content > 0 && message2.content < 11, {
                            max: 1,
                            time: 10000,
                            errors: ['time']
                        });
                    } catch (err) {
                        console.log(err);

                    }
                    const videoIndex = parseInt(response.first().content);
                    var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
                } catch (err) {
                    console.error(err);
                    return message.channel.send('?? I could not obtain any search results.');
                }
            }
            return handleVideo(video, message, channel);

        }

        async function handleVideo(video, message, channel, playlist = false) {
            const serverQueue = queue.get(message.guild.id);
            const song = {
                id: video.id,
                title: Util.escapeMarkdown(video.title),
                url: `https://www.youtube.com/watch?v=${video.id}`,
                thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
            };
            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: message.channel,
                    voiceChannel: channel,
                    connection: null,
                    songs: [],
                    volume: 3,
                    playing: true,
                    loop: false
                };
                queue.set(message.guild.id, queueConstruct);
                queueConstruct.songs.push(song);
                try {
                    var connection = await channel.join();
                    queueConstruct.connection = connection;
                    play(message.guild, queueConstruct.songs[0], message);
                } catch (error) {
                    console.error(`I could not join the voice channel: ${error}`);
                    queue.delete(message.guild.id);
                    return undefined;
                }

            } else {
                serverQueue.songs.push(song);
                console.log(serverQueue.songs);
                if (playlist) return undefined;
                else {
                    const embed = new MessageEmbed()
                        .setColor("BLACK")
                        .setTitle("Added To Queue", 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
                        .setTimestamp()
                        .setDescription(`[${song.title}]( ${song.url})`)
                        .setFooter(message.member.displayName, message.author.displayAvatarURL());
                    message.channel.send(embed)
                }
            }
            return undefined;
        }
        async function play(guild, song, msg) {
            const serverQueue = queue.get(guild.id);

            const dispatcher = serverQueue.connection.play(await ytdl(song.url, { filter: "audioonly", highWaterMark: 1 << 20, quality: "highestaudio" }))
                .on('finish', () => {
                    if (serverQueue.loop) {
                        serverQueue.songs.push(serverQueue.songs.shift());
                        return play(guild, serverQueue.songs[0], msg)
                    }
                    serverQueue.songs.shift();
                    play(guild, serverQueue.songs[0], msg)

                })
                .on('error', error => console.error(error));
            dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

            const embed = new MessageEmbed()
                .setColor("BLACK", 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
                .setTitle('Now Playing')
                .setTimestamp()
                .setDescription(`[${song.title}]( ${song.url})`)
                .setFooter(msg.member.displayName, msg.author.displayAvatarURL());
            serverQueue.textChannel.send(embed);

        }
} else if (message.content.startsWith(`${PREFIX}hiphop`)) {
const streamOptions = { seek: 0, volume: 1 };
        message.member.voice.channel.join().then(connection => {
            console.log("joined channel");
            const stream = ytdl('https://node-09.zeno.fm/ryxws1ckyk8uv?rj-ttl=5&rj-tok=AAABd4PH9bIA6iCFwJOBnvGDeg', { filter : 'audioonly' });
            const dispatcher = connection.playStream(stream, streamOptions);
            dispatcher.on("end", end => {
                console.log("left channel");
                message.member.voice.channel.join();
            });
        }).catch(err => console.log(err));




    } else if (message.content.startsWith(`${PREFIX}lyrics`)) {
const serverQueue = queue.get(message.guild.id)
    if (!serverQueue) return message.channel.send("There is nothing playing.",message.channel).catch(console.error);

    let lyrics = null;

    try {
      lyrics = await lyricsFinder(serverQueue.songs[0].title, "");
      if (!lyrics) lyrics = `No lyrics found for ${serverQueue.songs[0].title}.`;
    } catch (error) {
      lyrics = `No lyrics found for ${serverQueue.songs[0].title}.`;
    }

    let lyricsEmbed = new MessageEmbed()
      .setAuthor(`${serverQueue.songs[0].title} � Lyrics`, "https://i.ibb.co/FDhtDcB/blue-cd.gif")
      .setThumbnail(serverQueue.songs[0].img)
      .setColor("BLACK")
      .setDescription(lyrics)
      .setTimestamp();

    if (lyricsEmbed.description.length >= 2048)
      lyricsEmbed.description = `${lyricsEmbed.description.substr(0, 2045)}...`;
    return message.channel.send(lyricsEmbed).catch(console.error);

} else if (message.content.startsWith(`${PREFIX}lyric`)) {

    let lyrics = null;

    try {
      lyrics = await lyricsFinder(message.content, "");
      if (!lyrics) lyrics = `No lyrics found for ${message.content}.`;
    } catch (error) {
      lyrics = `No lyrics found for ${message.content}.`;
    }

    let lyricsEmbed = new MessageEmbed()
      .setAuthor(`${message.content} � Lyrics`, "https://i.ibb.co/FDhtDcB/blue-cd.gif")
      .setColor("BLACK")
      .setDescription(lyrics)
      .setTimestamp();

    if (lyricsEmbed.description.length >= 2048)
      lyricsEmbed.description = `${lyricsEmbed.description.substr(0, 2045)}...`;
    return message.channel.send(lyricsEmbed).catch(console.error);
}
           if (message.content.startsWith(`${PREFIX}queue`)) {
        if (!serverQueue) return message.channel.send('There Is Nothing Playing')
        let currentPage = 0;

        const embeds = embedGenerator(serverQueue)

        const queueEmbed = await message.channel.send(`Queue: ${currentPage + 1}/${embeds.length}`, embeds[currentPage])
        await queueEmbed.react('⬅️')
        await queueEmbed.react('➡️')


        const reactionFilter = (reaction, user) => ['⬅️', '➡️'].includes(reaction.emoji.name) && (message.author.id === user.id)
        const collector = queueEmbed.createReactionCollector(reactionFilter)

        collector.on('collect', (reaction, user) => {
            if (reaction.emoji.name === '➡️') {
                if (currentPage < embeds.length - 1) {
                    currentPage += 1;
                    queueEmbed.edit(`Queue: ${currentPage + 1}/${embeds.length}`, embeds[currentPage])


                }
            } else if (reaction.emoji.name === '⬅️') {
                if (currentPage !== 0) {
                    currentPage -= 1
                    queueEmbed.edit(`Queue: ${currentPage + 1}/${embeds.length}`, embeds[currentPage])

                }
            }

        })
    }
    function embedGenerator(serverQueue) {
        const Discord = require('discord.js')
        const embeds = []
        let songs = 10
        for (let i = 0; i < serverQueue.songs.length; i += 10) {
            const current = serverQueue.songs.slice(i, songs)
            let j = i - 1
            const info = current.map(song => `${++j}. [${song.title}](${song.url})`).join('\n')
            const embed = new Discord.MessageEmbed()
                .setDescription(`Now Playing: [${serverQueue.songs[0].title}](${serverQueue.songs[0].url}) \n ${info}`)
                .setColor('BLACK')

            embeds.push(embed)
        }
        return embeds
    }







    console.log(`${message.author.username}: ${args}`)

    async function handleVideo(video, message, voiceChannel, playlist = false) {
        const serverQueue = queue.get(message.guild.id)

        const song = {
            id: video.id,
            title: Util.escapeMarkdown(video.title),
            url: `https://www.youtube.com/watch?v=${video.id}`
        }


        if (!serverQueue) {
            const queueConstruct = {
                textChannel: message.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true,
                loop: false
            }
            queue.set(message.guild.id, queueConstruct)

            queueConstruct.songs.push(song)

            try {
                var connection = await voiceChannel.join()
                queueConstruct.connection = connection
                connection.voice.setDeaf(true)
                play(message.guild, queueConstruct.songs[0])
            } catch (error) {
                console.log(`There Was An Error Connecting To The Voice Channel: ${error}`)
                queue.delete(message.guild.id)
                return message.channel.send(`There Was En Error Connecting To The Voice Channel: ${error}`)
            }
        } else {
            serverQueue.songs.push(song)
            if (playlist) return undefined
            let embed = new MessageEmbed()
                .setColor(0x030303)
                .setAuthor('Queue', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
                .setDescription(`[${song.title}](${song.url}) has been added to the queue`)
                .setFooter(`Requested By: ${message.author.username}`, message.author.displayAvatarURL())
            return message.channel.send(embed)
        }
        return undefined
    }




})
function play(guild, song) {
    const serverQueue = queue.get(guild.id)

    if (!song) {
        serverQueue.voiceChannel.leave()
        queue.delete(guild.id)
        return
    }


    const dispatcher = serverQueue.connection.play(ytdl(song.url))
        .on('finish', () => {
            if (!serverQueue.loop) serverQueue.songs.shift()
            play(guild, serverQueue.songs[0])
        })
        .on('error', error => {
            console.log(error)
        })
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5)
    let embed = new MessageEmbed()
        .setColor(0x030303)
        .setAuthor('Started Playing', 'https://i.ibb.co/FDhtDcB/blue-cd.gif')
        .setDescription(`[${serverQueue.songs[0].title}](${serverQueue.songs[0].url})`)
    serverQueue.textChannel.send(embed)
        .then(sentMessage => sentMessage.delete({ timeout: 120000 }))
        .catch(console.error)



}


client.login(TOKEN)
