require("dotenv").config({
    path: require("path").resolve(__dirname, "../../.env")
});


const fs = require("fs");
const path = require("path");


const queries = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "queries.json"),
        "utf-8"
    )
).queries;



const API_URL = process.env.BENCHMARK_API_URL;

const TOP_K =
    Number(process.env.BENCHMARK_TOP_K) || 3;



if(!API_URL){
    console.error(
        "BENCHMARK_API_URL missing in .env"
    );
    process.exit(1);
}



async function runBenchmark(){


    const stats = {

        totalQueries: queries.length,

        exactHits:0,
        semanticHits:0,
        misses:0,
        errors:0,

        llmCalls:0,
        llmSkipped:0,

        totalLatency:0,
        totalTokens:0
    };



    const results = [];



    console.log(
        `Benchmark started: ${queries.length} queries`
    );

    console.log(
        `API: ${API_URL}\n`
    );



    for(const item of queries){


        const start = Date.now();



        try{


            const response =
                await fetch(
                    API_URL,
                    {
                        method:"POST",

                        headers:{
                            "Content-Type":
                            "application/json"
                        },

                        body:JSON.stringify({

                            query:item.query,

                            topK:TOP_K

                        })
                    }
                );



            let data;


            try{

                data = await response.json();

            }

            catch{

                console.log(
                    "\nInvalid JSON response"
                );

                console.log(
                    await response.text()
                );

                continue;
            }



            const latency =
                Date.now()-start;



            stats.totalLatency += latency;



            let level = "miss";



            if(data.cacheLevel==="exact"){

                stats.exactHits++;
                level="exact";

            }

            else if(data.cacheLevel==="semantic"){

                stats.semanticHits++;
                level="semantic";

            }

            else{

                stats.misses++;


                if(data.llmDurationMs){

                    stats.llmCalls++;

                }

            }



            if(data.llmSkipped){

                stats.llmSkipped++;

            }



            if(data.llmUsage){

                stats.totalTokens +=
                    data.llmUsage.total_tokens || 0;

            }



            results.push({

                id:item.id,

                query:item.query,

                cacheLevel:data.cacheLevel,

                latency,

                tokens:
                    data.llmUsage?.total_tokens || 0,

                llmCalled:
                    !!data.llmDurationMs,

                error:false

            });



            console.log(
                `${item.id}. ${level} | ${latency}ms`
            );


        }


        catch(err){


            const latency =
                Date.now()-start;


            stats.errors++;


            results.push({

                id:item.id,

                query:item.query,

                cacheLevel:"error",

                latency,

                error:true,

                message:err.message

            });



            console.log(
                `${item.id}. ERROR | ${latency}ms`
            );


            console.log(
                err.message
            );

        }

    }



    const cacheHits =
        stats.exactHits +
        stats.semanticHits;



    const avgLatency =
        stats.totalLatency /
        stats.totalQueries;



    const summary = {


        totalQueries:
            stats.totalQueries,


        exactHits:
            stats.exactHits,


        semanticHits:
            stats.semanticHits,


        cacheHitRate:
            (
                cacheHits /
                stats.totalQueries *
                100
            ).toFixed(2)+"%",


        ragMisses:
            stats.misses,


        llmCalls:
            stats.llmCalls,


        llmCallsAvoided:
            (
                (
                    stats.totalQueries -
                    stats.llmCalls
                )
                /
                stats.totalQueries *
                100
            ).toFixed(2)+"%",


        llmSkipped:
            stats.llmSkipped,


        errors:
            stats.errors,


        totalTokens:
            stats.totalTokens,


        averageLatencyMs:
            avgLatency.toFixed(2)

    };



    console.log(
        "\n========== RESULTS ==========\n"
    );


    console.table(summary);



    fs.writeFileSync(

        path.join(
            __dirname,
            "benchmark-results.json"
        ),

        JSON.stringify(
            {
                summary,
                results
            },

            null,
            2
        )

    );


    console.log(
        "\nSaved: benchmark-results.json"
    );

}



runBenchmark();